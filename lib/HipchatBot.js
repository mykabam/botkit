var Botkit = require(__dirname + '/CoreBot.js');
var request = require('request');
var express = require('express');
var bodyParser = require('body-parser');

function Hipchatbot(configuration) {

  // Create a core botkit bot
  var hipchat_botkit = Botkit(configuration || {});
  if (configuration.addon) {
    hipchat_botkit.addon = configuration.addon;
    if (configuration.addon.settings && configuration.addon.settings.Redis) {
      // pass in storage methods that CoreBot requires and connect with redis storage defined by addon
      // TODO: this feature isn't fully developed yet
     // configuration.storage = configureRedisStorage();
    }
  }

  var spawnedBots = {};
  // customize the bot definition, which will be used when new connections
  // spawn!
  hipchat_botkit.defineBot(require(__dirname + '/Hipchatbot_worker.js'));

 // Middleware to track spawned bots and connect existing bots to incoming webhooks
  hipchat_botkit.middleware.spawn.use(function(worker, next) {

    // If we already have a connection, copy it
    // into the new bot so it can be used for replies.
    if (worker.config.clientKey && !spawnedBots[worker.config.clientKey]) {
      worker.identity.jid = worker.config.jid;
      worker.identity.id = worker.config.id;
      worker.name = worker.config.name;
      worker.groupId = worker.config.groupId;
      worker.configureAPI(configuration.addon);

      configuration.addon.loadClientInfo(worker.config.clientKey).then(function(clientInfo) {
        worker.config.clientInfo = clientInfo;
        worker.configureAPI(configuration.addon, clientInfo);
        // It's helpful to reference the bot with these 2 keys - clientKey and groupId - for O1 lookup
        spawnedBots[worker.config.clientKey] = worker;
        spawnedBots[worker.config.groupId] = worker;
        next(null, worker);
      });
    } else {
      worker = spawnedBots[worker.config.clientKey];
      next(null, worker);
    }

  });

  hipchat_botkit.findGroupById = function(groupId, cb) {
    hipchat_botkit.storage.teams.get(id, cb);
  };

  // TODO: update these fuunctions when alternate storage methods (eg Redis) are functional
  hipchat_botkit.findBotByClientKey = function(clientKey) {
    return spawnedBots[clientKey];
  };

  hipchat_botkit.findBotByGroupId = function(groupId) {
    return spawnedBots[groupId];
  };

  // set up a web route to handle an incoming webhook
  hipchat_botkit.createWebhookEndpoints = function(webserver, mountPath) {
    hipchat_botkit.log(
        '** Serving webhook endpoints for incoming ' +
        'webhooks at: http://MY_HOST:' + hipchat_botkit.config.port + '/webhook');
    var path = !mountPath || mountPath === '' || mountPath === '/' ?
      '/webhook' :
      mountPath + '/webhook';

    webserver.post(path,
      hipchat_botkit.addon.authenticate(),
      function (req, res) {
        var bot = hipchat_botkit.findBotByClientKey(req.clientInfo.clientKey);
        if (req.body.event === 'room_message' && bot) {
          var message = req.body.item.message;
          message.channel = req.body.item.room.id;
          message.user = req.body.item.message.from.id;
          message.text = message.message.trim();
          hipchat_botkit.trigger('message_received', [bot, message]);
        }
        res.send('ok');
      }

    );

    return hipchat_botkit;
  };

  hipchat_botkit.setupWebserver = function(port, cb) {
    // We use [Handlebars](http://handlebarsjs.com/) as our view engine
    // via [express-hbs](https://npmjs.org/package/express-hbs)
    // var hbs = require('express-hbs');

    // Anything in ./views are HBS templates
    var viewsDir = __dirname + '/views';
    if (!port) {
      throw new Error('Cannot start webserver without a port');
    }
    if (isNaN(port)) {
      throw new Error('Specified port is not a valid number');
    }

    var static_dir =  __dirname + '/public';
    var ac = require('atlassian-connect-express');
    ac.store.register('redis', require('atlassian-connect-express-redis'));

    // Your routes live here; this is the C in MVC
    // var routes = require('./routes');

    if (hipchat_botkit.config && hipchat_botkit.config.webserver && hipchat_botkit.config.webserver.static_dir)
      static_dir = hipchat_botkit.config.webserver.static_dir;

    hipchat_botkit.config.port = port;

    hipchat_botkit.webserver = express();

    // Bootstrap the `atlassian-connect-express` library
    var addon = ac(hipchat_botkit.webserver);
    // Load the HipChat AC compat layer
    var hipchat = require('atlassian-connect-express-hipchat')(addon, hipchat_botkit.webserver);

    hipchat_botkit.webserver.use(bodyParser.json());
    hipchat_botkit.webserver.use(bodyParser.urlencoded({ extended: true }));
    hipchat_botkit.webserver.use(express.static(static_dir));
    // Configure the Handlebars view engine
    hipchat_botkit.webserver.engine('hbs', hbs.express3({partialsDir: viewsDir}));
    hipchat_botkit.webserver.set('view engine', 'hbs');
    hipchat_botkit.webserver.set('views', viewsDir);
    // Enable the ACE global middleware (populates res.locals with add-on related stuff)
    hipchat_botkit.webserver.use(addon.middleware());

    // Wire up your routes using the express and `atlassian-connect-express` objects
    // routes(hipchat_botkit.webserver, addon);

    var server = hipchat_botkit.webserver.listen(
      hipchat_botkit.config.port,
      function() {
        hipchat_botkit.log('** Starting webserver on port ' +
          hipchat_botkit.config.port);
        if (cb) { cb(null, hipchat_botkit.webserver, addon); }
      });

    // This is an example route that's used by the default for the configuration page
    // https://developer.atlassian.com/hipchat/guide/configuration-page
    hipchat_botkit.webserver.get('/config',
      // Authenticates the request using the JWT token in the request
      addon.authenticate(),
      function (req, res) {
        // The `addon.authenticate()` middleware populates the following:
        // * req.clientInfo: useful information about the add-on client such as the
        //   clientKey, oauth info, and HipChat account info
        // * req.context: contains the context data accompanying the request like
        //   the roomId
        res.render('config', req.context);
      }
    );

    return hipchat_botkit;

  };

  hipchat_botkit.handleHipchatEvents = function() {

    hipchat_botkit.log('** Setting up custom handlers for processing Hipchat messages');
    hipchat_botkit.on('message_received', function(bot, message) {
      hipchat_botkit.debug('DEFAULT HIPCHAT MSG RECEIVED RESPONDER');
      var mentionSyntax = '@' + bot.identity.mention_name;
      var mention = new RegExp(mentionSyntax, 'i');
      var direct_mention = new RegExp('^' + mentionSyntax, 'i');

      if (message.type === 'message') {

        if (message.message) {
          message.text = message.message.trim();
        }

        if (message.text.match(direct_mention)) {
          // this is a direct mention
          message.text = message.text.replace(direct_mention, '');
          message.event = 'direct_mention';

          hipchat_botkit.trigger('direct_mention', [bot, message]);
          return false;
        } else if (message.text.match(mention)) {
          message.event = 'mention';
          hipchat_botkit.trigger('mention', [bot, message]);
          return false;
        }

      } else if (message.type === 'private_message') {
        // this is a direct message
        if (message.user == bot.config.jid) {
          return false;
        }
        if (!message.text) {
          // message without text is probably an edit
          return false;
        }

        // remove direct mention so the handler doesn't have to deal with it
        message.text = message.text.replace(direct_mention, '');

        message.event = 'direct_message';

        hipchat_botkit.trigger('direct_message', [bot, message]);
        return false;
      } else {
        // this is a non-message object, so trigger a custom event based on the type
        hipchat_botkit.trigger(message.type, [bot, message]);
      }
    });
  };

  // set up the RTM message handlers once
  hipchat_botkit.handleHipchatEvents();

  return hipchat_botkit;
};

// NOTE: this is not functional yet!
function configureRedisStorage(addon) {
  // This is the object that CoreBot.js requires if custom storage type is specified.
  // Here we'll connect the storage scheme that botkit uses to the redis storage scheme
  // used by atlassian-hipchat-connect. Note, the keys that ACE uses to track the groups
  // are the *clientKeys* (the oauthId for the installation), not the group ids.
  const _get = addon.settings.get;
  const _set = addon.settings.set;
  var storage = {
    teams: {
      get: function(clientKey, cb) {
        _get('clientInfo', clientKey).then(function(clientInfo) {
          return cb(null, clientInfo);
        }).catch(function(e) {
          return cb(e);
        });
      },
      save: function(clientInfo, clientKey, cb) {
        _set('clientInfo', clientInfo, clientKey).then(function() {
          return cb(clientKey);
        }).catch(function(e) {
          return cb(e);
        });
      }
    },
    users: {
      get: function(cb) { cb() },
      save: function(cb) { cb() }
    },
    channels: {
      get: function(cb) { cb() },
      save: function(cb) { cb() }
    }
  };

  // Alias Hipchat semantics to Slack semantics
  storage.groups = storage.teams;
  storage.rooms = storage.channels;

  return storage;
}

module.exports = Hipchatbot;
