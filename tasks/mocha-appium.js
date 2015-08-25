// this is adapated from https://github.com/gregrperkins/grunt-mocha-hack

"use strict";

module.exports = function(grunt) {
  var createDomain = require('domain').create;
  var path = require('path');
  var mocha = require('./lib/mocha-runner');
  var mochaReporterBase = require('mocha/lib/reporters/base');
  var spawn = require('child_process').spawn;
  var wd = require('wd');
  var appiumLauncher = require('./lib/appium-launcher');
  var _ = grunt.util._;
  var ios_webkit;


  grunt.registerMultiTask('mochaAppium', 'Run functional tests with mocha', function() {
    var done = this.async();
    // Retrieve options from the grunt task.
    var options = this.options({
      usePromises: false
    });

    // We want color in our output, but when grunt-contrib-watch is used,
    //  mocha will detect that it's being run to a pipe rather than tty.
    // Mocha provides no way to force the use of colors, so, again, hack it.
    var priorUseColors = mochaReporterBase.useColors;
    if (options.useColors) {
      mochaReporterBase.useColors = true;
    }

    // More agnostic -- just remove *all* the uncaughtException handlers;
    //  they're almost certainly going to exit the process, which,
    //  in this case, is definitely not what we want.
    var uncaughtExceptionHandlers = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    var unmanageExceptions = function() {
      uncaughtExceptionHandlers.forEach(
        process.on.bind(process, 'uncaughtException'));
    };
    // Better, deals with more than just grunt?

    // Restore prior state.
    var restore = function() {
      mochaReporterBase.useColors = priorUseColors;
      unmanageExceptions();
      done();
    };

    grunt.util.async.forEachSeries(this.files, function(fileGroup, next){
      runTests(fileGroup, options, next);
    }, restore);
  });


  function runTests(fileGroup, options, next){

    // When we're done with mocha, dispose the domain
    var mochaDone = function(errCount) {
      var withoutErrors = (errCount === 0);
      // Indicate whether we failed to the grunt task runner
      next(withoutErrors);
    };

    // launch appium
    if(options.platformName == 'iOS'){
      ios_webkit = spawn('ios_webkit_debug_proxy',['-c', options.udid+':27753','-d'])
      ios_webkit.stdout.on('data', function(data){
        //grunt.log.debug('ios > '+ data.toString().replace('\n', ''));
      });
      ios_webkit.stderr.on('data', function(data){
        //grunt.log.verbose.error('ios > '+ data);
      });
    }

    appiumLauncher(_.pick(options, 'appiumPath', 'appiumArgs'), function(err, appium){
      grunt.log.writeln('Appium Running');
      if(err){
        appium.kill();
        if(ios_webkit)
          ios_webkit.kill();
        grunt.fail.fatal(err);
        return;
      }


      appium.stdout.on('data', function(data){
        grunt.log.debug('Appium > '+ data.toString().replace('\n', ''));
      });

      appium.stderr.on('data', function(data){
        // Appium has debug logging to stderr, so supress these logs with
        // --verbose since they're not actual errors.
        grunt.log.verbose.error('Appium > '+ data);
      });

      var remote = options.usePromises ? 'promiseChainRemote' : 'remote';
      if(options.require){
        try{
          var libs = require('fs').readdirSync(path.join(process.cwd(),options.require))

          for(var i = 0;i<libs.length;i++){
            require(path.join(process.cwd(),options.require,libs[i]))(wd)
          }
        }catch(e){

        }
      }

      var browser = wd[remote](appium.host, appium.port);

      var opts = _.omit(options, 'usePromises', 'appiumPath');

      browser.on('status', function(info){
        grunt.log.writeln('\x1b[36m%s\x1b[0m', info);
      });

      browser.on('command', function(meth, path, data){
        grunt.log.debug(' > \x1b[33m%s\x1b[0m: %s', meth, path, data || '');
      });

      browser.init(opts, function(err){
        if(err){
          grunt.fail.fatal(err);
          return;
        }

        var runner = mocha(options,browser,wd, grunt, fileGroup);
        // Create the domain, and pass any errors to the mocha runner
        var domain = createDomain();
        domain.on('error', runner.uncaught.bind(runner));

        // Give selenium some breathing room
        setTimeout(function(){
          // Selenium Download and Launch
          domain.run(function() {
            runner.run(function(err){
              browser.quit(function(){
                appium.kill();
                if(ios_webkit)
                  ios_webkit.kill();
                mochaDone(err);
              });
            });
          });
        }, 300);
      });

    });

  }
};
