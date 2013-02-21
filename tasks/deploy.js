/*
 * grunt-gui-deploy
 * 
 *
 * Copyright (c) 2013 Guardian Interactive team
 * Licensed under the none license.
 */

/*jslint white: true */
/*global module, require, process */

module.exports = function( grunt ) {

	'use strict';

	grunt.registerTask( 'deploy', 'Deploy projects to the Guardian Interactive Team S3 bucket', function() {
		
		var done,
			fail,
			
			// dependencies
			Deferred,
			fs,
			path,
			mime,
			
			// config
			config,
			ignore,
			
			// helpers
			s3,
			getS3,
			checkIfFolderExists,
			fetchManifest,
			uploadFiles,
			uploadManifest,
			uploadVersion,
			getVersion,
			lock,
			unlock;


		// this is an async task
		done = this.async();

		fail = function ( msg ) {
			return function () {
				grunt.log.error( msg );
				done( false );
			};
		};


		// dependencies
		Deferred = require( 'simply-deferred' ).Deferred;
		fs = require( 'fs' );
		path = require( 'path' );
		mime = require( 'mime' );


		// config
		config = grunt.config( 'deploy' );
		ignore = this.flags.ignore;


		// check config
		if ( !config.bucket ) {
			grunt.log.error( 'No bucket specified' );
			done( false );
		}

		if ( !config.path ) {
			grunt.log.error( 'No project path specified' );
			done( false );
		}

		// remove trailing slash from config.path, if it exists
		if ( config.path.substr( -1 ) === path.sep ) {
			config.path = config.path.substr( 0, config.path.length - 1 );
		}
		


		// helpers
		getS3 = function () {
			var AWS, credentials, accessKeyId, secretAccessKey;

			AWS = require( 'aws-sdk' );

			// load credentials from task config...
			if ( config.accessKeyId && config.secretAccessKey ) {
				accessKeyId = config.accessKeyId;
				secretAccessKey = config.secretAccessKey;
			}

			// ...or specified JSON file
			else if ( config.credentials && fs.fileExistsSync( config.credentials ) ) {
				credentials = JSON.parse( fs.readFileSync( config.credentials ).toString() );
				accessKeyId = credentials.accessKeyId;
				secretAccessKey = credentials.secretAccessKey;
			}

			// ... or from environment
			else if ( process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ) {
				accessKeyId = process.env.AWS_ACCESS_KEY_ID;
				secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
			}

			// no credentials? boo
			if ( !accessKeyId || !secretAccessKey ) {
				grunt.log.error( 'Missing AWS credentials!' );
				done( false );
			}

			// update config
			AWS.config.update({
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey,
				region: config.region || 'us-east-1'
			});

			// get our s3 object
			return new AWS.S3();
		};


		checkIfFolderExists = function ( folder, callback ) {
			var listObjectsRequest = s3.client.listObjects({ Bucket: config.bucket, Prefix: folder });

			listObjectsRequest.on( 'error', fail( 'Could not fetch object list from folder "' + folder + '"' ) );

			listObjectsRequest.on( 'success', function ( response ) {
				var contents;

				if ( response && response.data && response.data.Contents ) {
					contents = response.data.Contents;

					if ( contents.length ) {
						callback( true );
						return;
					}
				}

				callback( false );
			});

			listObjectsRequest.send();
		};


		fetchManifest = function () {
			var deferred, objectRequest;

			deferred = new Deferred();

			objectRequest = s3.client.getObject({
				Bucket: config.bucket,
				Key: config.path + '/manifest.json'
			});

			objectRequest.on( 'error', deferred.resolve );

			objectRequest.on( 'success', function ( response ) {
				var data, remoteManifest;

				data = response.data.Body.toString();

				try {
					remoteManifest = JSON.parse( data );
				} catch ( err ) {
					grunt.log.error( 'Invalid manifest.json file' );
					done( false );
				}

				deferred.resolve( remoteManifest );
			});

			objectRequest.send();

			return deferred;
		};

		lock = function () {
			var deferred, putObjectRequest;

			deferred = new Deferred();

			putObjectRequest = s3.client.putObject({
				Bucket: config.bucket,
				Key: config.path + '/locked.txt',
				ACL: 'public-read',
				Body: 'This project is currently locked. Double-check none of the team are currently deploying. If this state persists, something may have gone titsup - delete this file'
			});

			putObjectRequest.on( 'error', fail( '\nCould not lock project' ) );

			putObjectRequest.on( 'success', function () {
				grunt.log.writeln( '\nProject is locked. Proceeding with upload\n' );
				deferred.resolve();
			});

			putObjectRequest.send();

			return deferred;
		};

		unlock = function () {
			var deferred, deleteObjectRequest;

			deferred = new Deferred();

			deleteObjectRequest = s3.client.deleteObject({
				Bucket: config.bucket,
				Key: config.path + '/locked.txt'
			});

			deleteObjectRequest.on( 'error', fail( '\nCould not unlock project' ) );

			deleteObjectRequest.on( 'success', function () {
				grunt.log.writeln( '\nProject is unlocked\n' );
				deferred.resolve();
			});

			deleteObjectRequest.send();

			return deferred;
		};

		uploadVersion = function ( v ) {
			var deferred;

			grunt.log.writeln( 'Uploading version ' + v );

			deferred = new Deferred();

			// deferred stew!
			lock().then( function () {
				uploadFiles( v ).then( function () {
					uploadManifest( v ).then( function () {
						unlock().then( deferred.resolve );
					});
				});
			});

			return deferred;
		};

		uploadFiles = function ( v ) {
			var deferred, queue;

			deferred = new Deferred();
			queue = [];

			grunt.log.writeln( 'Uploading files to ' + config.path + '/v/' + v );

			grunt.file.recurse( config.root, function ( abspath, rootdir, subdir, filename ) {
				var putObjectRequest, normalisedSubdir, relpath;

				// normalise subdir, for the benefit of bongo and other windows users...
				if ( subdir ) {
					normalisedSubdir = subdir.split( path.sep ).join( '/' );
					relpath = normalisedSubdir + '/' + filename;
				} else {
					relpath = filename;
				}

				grunt.log.writeln( 'Starting upload: ' + relpath );

				queue[ queue.length ] = relpath;

				putObjectRequest = s3.client.putObject({
					Bucket: config.bucket,
					Key: [ config.path, 'v', v, relpath ].join( '/'),
					ContentType: mime.lookup( filename ),
					ACL: 'public-read',
					Body: grunt.file.read( abspath )
				});

				putObjectRequest.on( 'error', fail( 'Error uploading ' + relpath ) );

				putObjectRequest.on( 'success', function () {
					var index;

					grunt.log.writeln( 'File uploaded (' + ( queue.length - 1 ) + ' to go): ' + relpath );

					index = queue.indexOf( relpath );
					if ( index === -1 ) {
						grunt.log.error( 'Something VERY STRANGE has happened' );
						done( false );
					}

					queue.splice( index, 1 );

					if ( !queue.length ) {
						deferred.resolve();
					}
				});

				putObjectRequest.send();
			});

			return deferred;
		};

		uploadManifest = function ( v ) {
			var deferred, manifest, putObjectRequest;

			deferred = new Deferred();

			manifest = {
				guid: config.guid,
				v: v
			};

			putObjectRequest = s3.client.putObject({
				Bucket: config.bucket,
				Key: config.path + '/manifest.json',
				ContentType: 'application.json',
				ACL: 'public-read',
				Body: JSON.stringify( manifest )
			});

			putObjectRequest.on( 'error', fail( 'Error uploading manifest.json' ) );

			putObjectRequest.on( 'success', function () {
				grunt.log.writeln( 'Uploaded manifest.json' );
				deferred.resolve();
			});

			putObjectRequest.send();

			return deferred;
		};

		getVersion = function ( manifest ) {
			if ( ignore ) {
				return ( !manifest || !manifest.v ? 1 : manifest.v + 1 );
			}

			if ( !manifest ) {
				grunt.log.error( 'No remote manifest found. Use grunt deploy:ignore to deploy anyway (this will create version 1, and overwrite any files in the folder with the same name!)' );
				return -1;
			}

			if ( manifest.v === undefined ) {
				grunt.log.error( 'Invalid manifest found. Use grunt deploy:ignore to deploy anyway (this will create version 1, and overwrite any files in the folder with the same name!)' );
				return -1;
			}

			if ( manifest.guid !== config.guid ) {
				grunt.log.error( 'Remote guid does not match the guid specified in Gruntfile.js. Is this definitely the same project? Use grunt deploy:ignore to deploy anyway (this will create version ' + ( manifest.v + 1 ) + ', and overwrite any files in the folder with the same name!)' );
				return -1;
			}

			return manifest.v + 1;
		};



		// execute task
		s3 = getS3();

		checkIfFolderExists( config.path, function ( folderExists ) {
			
			// if the project folder already exists, we need to verify the guid in the manifest
			// to avoid accidental naming collisions etc
			if ( folderExists ) {
				grunt.log.writeln( 'Project folder exists. Continuing' );
				fetchManifest().then( function ( manifest ) {
					var version = getVersion( manifest );

					if ( version === -1 ) { // sentinel value
						done( false );
					} else {
						uploadVersion( version ).then( done );
					}
				});
			}

			// otherwise we can merrily uplopad our first version
			else {
				grunt.log.writeln( 'Project folder does not exist. Creating' );
				uploadVersion( 1 ).then( done );
			}
		});
		
	});

};
