var hipchatWebApi = require(__dirname + '/Hipchat_web_api.js');
var Connector = require('./HipchatConnector.js');

module.exports = function(botkit, config) {
  var bot = {
    botkit: botkit,
    config: config || {},
    utterances: botkit.utterances,
    identity: { // default identity values
      id: null,
      name: '',
      mention_name: ''
    },
    connector: null
  };

  bot.startConversationInThread = function(message, cb) {
    botkit.startConversation(this, message, cb);
  };

  // We'll alias these methods since the hipchat bot only supports "private" conversations anyway
  bot.startPrivateConversation = bot.startConversationInThread;

  bot.send = function(message, cb) {
    botkit.debug('SAY', message);
    var opts = {};
    if (!message.clientInfo) {
      bot.connector.send(message.user, message.text);
      return cb && cb();
    }

    if (message.card) {
      opts = { 'options': { 'color': 'yellow' } };
    }

    bot.api.sendMessage(message.channel, message.text, opts, message.card).then(function (data) {
      cb && cb(null, data);
    }).catch(function(err) {
      cb && cb(err);
    });

  };

  bot.reply = function(src, resp, cb) {
    var msg = {};

    if (typeof(resp) == 'string') {
      msg.text = resp;
    } else {
      msg = resp;
    }

    msg.user = src.user;
    msg.channel = src.channel;
    msg.clientInfo = src.clientInfo;

    bot.say(msg, cb);
  };

  bot.findConversation = function(message, cb) {
    botkit.debug('CUSTOM FIND CONVO', message.user, message.channel);
    for (var t = 0; t < botkit.tasks.length; t++) {
      for (var c = 0; c < botkit.tasks[t].convos.length; c++) {
        if (
          botkit.tasks[t].convos[c].isActive() &&
          botkit.tasks[t].convos[c].source_message.user == message.user
        ) {
          botkit.debug('FOUND EXISTING CONVO!');
          cb(botkit.tasks[t].convos[c]);
          return;
        }
      }
    }

    cb();
  };

  bot.configureAPI = function(addon, clientInfo) {
    bot.api = hipchatWebApi.call(this, addon, clientInfo)
    return bot;
  };

  bot.connect = function(cb) {
    var botInfo = {
      id: bot.config.id,
      jid: bot.config.jid,
      password: bot.config.password
    };

    bot.connector = new Connector();
    bot.connector.connect(botInfo);

    botkit.debug('connect');

    bot.connector.on('online', function(data) {
      botkit.debug('Connected with JID: ' + data.jid.user);

      bot.connector.getVCard(data.jid.toString(), function(vCard) {
        // now that we have our name we can let rooms be joined
        bot.connector.name = vCard.fn;
        // this is the name used to @mention us
        bot.identity.mention_name = vCard.nickname;
        cb && cb();
      })
    });

    bot.connector.on('chat', function(from, message) {
      var msg = {
        text: message,
        user: from,
        channel: null,
        type: 'private_message'
      };

      // the JID is <groupId>_<userId>@chat.hipchat.com
      var atIndex = from.indexOf('@');
      var hcUserId, _index;
      if (atIndex !== -1) {
        _index = from.indexOf('_');
        msg.user_id = Number.parseInt(from.slice(_index + 1, atIndex));
        msg.group_id = Number.parseInt(from.slice(0, _index));
      } else {
        msg.user_id = from;
      }

      botkit.receiveMessage(bot, msg);
    });

    bot.connector.on('invite', function(room, from, reason) {
      botkit.debug(' -=- > Invite to ' + room + ' by ' + from + ': ' + reason);
      bot.connector.join(room + '/' + bot.connector.name);
    })

    bot.connector.on('error', function(err) {
      botkit.debug(err);
      cb && cb(err);
    });

    // bot.config.addon.on('uninstalled', function (id) {
    //   if (bot.config.clientKey !== id) {
    //     return;
    //   };
    //   botkit.debug('destroy');
    //   bot.destroy();
    // });

    botkit.startTicking();
  };

  bot.disconnect = function() {
    bot.connector.disconnect();
  };

  /**
   * Shutdown and cleanup the spawned worker
   */
  bot.destroy = function() {
    bot.disconnect();
    botkit.shutdown();
  };

  return bot;
};
