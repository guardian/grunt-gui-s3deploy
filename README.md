# grunt-gui-s3deploy

> Deploy project to the Guardian Interactive Team S3 bucket

## Getting Started
This plugin requires Grunt `~0.4.0`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install git://github.com/GuardianInteractive/grunt-gui-s3deploy.git
```

One the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-gui-s3deploy');
```

## The "s3deploy" task

### Overview
In your project's Gruntfile, add a section named `s3deploy` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  s3deploy: {
    bucket: 'gdn-cdn',                           // the bucket name
    path: '2013/feb/my-project',                 // path from bucket to project
    root: 'dist'                                 // folder containing files to upload,
    guid: '54e3fea3-9efa-4b31-b2b9-d0132026c7b1' // project guid, generated at init
  },
})
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
0.1.0 - first release
