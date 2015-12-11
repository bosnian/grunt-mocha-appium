var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var os = require('os');
var freeport = require('freeport');
var isWin = (os.platform() === 'win32'); 

function run(options, cb) {
  options = options || {};
  var APPIUM_PATH = options.appiumPath || 'appium';

  freeport(function(err, port) {
    if( err ){
      throw err;
    }
    if (isWin) {
      port = 4723;
    }
    var appiumArgs = options.appiumArgs || [];
    appiumArgs.push('--port', port);
    console.log('Starting Appium with args: ' + appiumArgs.join(" "));

    var child;
    if (isWin) {
      child = exec(APPIUM_PATH, appiumArgs);
      child.host = '127.0.0.1';
    } else {
      child = spawn(APPIUM_PATH, appiumArgs);
      child.host = '0.0.0.0';
    }
    child.port = port;

    function badExit() {
      cb(new Error('Could not start Appium.'), child);
    }

    child.stderr.on('data', function(data){
      console.log(data.toString());
      badExit();
    })

    child.stdout.on('data', function(data) {
      var sentinal = 'Welcome to Appium';
      if (data.toString().indexOf(sentinal) !== -1) {
        child.removeListener('exit', badExit);
        child.removeListener('error', badExit);
        cb(null, child);
      }
    });

    child.on('exit', badExit);
    child.on('error', badExit);
  });
}

module.exports = function(options, cb) {
  if( !cb && typeof options === 'function' ){
    cb = options;
    options = {};
  }

  run(options, cb);
};

