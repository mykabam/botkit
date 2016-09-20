var RSVP = require('rsvp');
var http = require('request');
var _ = require('lodash');

module.exports = function(addon, clientInfo) {
  var bot = this;

  function request(options){

    return new RSVP.Promise(function(resolve, reject) {
      function makeRequest() {
        addon.getAccessToken(clientInfo).then(function(token){
          // console.log(token);
          var hipchatBaseUrl = clientInfo.capabilitiesDoc.links.api;
          var params = {
            method: options.method || 'GET',
            url: hipchatBaseUrl + options.resource,
            qs: _.extend({auth_token: token.access_token}, options.qs),
            body: options.body,
            json: true
          };

          http(params, function(err, resp, body){
            if (err || (body && body.error)) {
              reject(err || body.error.message);
              return;
            }

            resolve(resp);
          });
        });
      }

      if (!clientInfo) {
        reject(new Error('clientInfo not available'));
        return;
      }
      if (typeof clientInfo === 'object'){
        makeRequest();
      } else {
        addon.loadClientInfo(clientInfo).then(makeRequest);
      }

    });

  }

  function fail(response, reject) {
    var code = response.statusCode;
    var msg = 'Unexpected response: [' + code + '] ' + require('http').STATUS_CODES[code];
    var err = new Error(msg);
    err.response = response;
    reject(err);
  }

  return {

    sendMessage: function (roomId, msg, opts, card){
      opts = (opts && opts.options) || {};
      return request({
        method: 'POST',
        resource: '/room/' + roomId + '/notification',
        body: {
          message: msg,
          message_format: (opts.format ? opts.format : 'html'),
          color: (opts.color ? opts.color : 'yellow'),
          notify: (opts.notify ? opts.notify : false),
          card: card
        }
      });
    },

    sendPrivateMessage: function (userId, msg, opts, card){
      opts = (opts && opts.options) || {};
      return request({
        method: 'POST',
        resource: '/user/' + userId + '/message',
        body: {
          message: msg,
          message_format: (opts.format ? opts.format : 'html'),
          color: (opts.color ? opts.color : 'yellow'),
          notify: (opts.notify ? opts.notify : true),
          card: card
        }
      });
    },

    createRoom: function(body) {
      return request({
        method: 'POST',
        resource: '/room',
        body: body
      });
    },

    addUserToRoom: function(userId, roomId, roles) {
      return request({
        method: 'PUT',
        resource: '/room/' + roomId + '/member/' + userId,
        body: roles
      });
    },

    getRoomWebhooks: function (roomId){
      return new RSVP.Promise(function (resolve, reject) {
        var all = [];
        function getPage(offset) {
          request({
            method: 'GET',
            resource: '/room/' + roomId + '/webhook',
            qs: {'start-index': offset}
          }).then(function (response) {
            if (response.statusCode === 200) {
              var webhooks = response.body;
              if (webhooks.items.length > 0) {
                all = all.concat(webhooks.items);
                getPage(all.length);
              } else {
                resolve(all);
              }
            } else {
              fail(response, reject);
            }
          }, reject);
        }
        getPage(0);
      });
    },

    addRoomWebhook: function (roomId, webhook) {
      return request({
        method: 'POST',
        resource: '/room/' + roomId + '/webhook',
        body: webhook
      });
    },

    removeRoomWebhook: function (roomId, webhookId) {
      return request({
        method: 'DELETE',
        resource: '/room/' + roomId + '/webhook/' + webhookId
      });
    },

    getRooms: function () {
      return request({
        method: 'GET',
        resource: '/room'
      });
    },
    // You can also access this information through the client-side api:
    // https://developer.atlassian.com/hipchat/guide/hipchat-ui-extensions/views/javascript-api#JavascriptAPI-GettingcontextualinformationfromtheHipChatClient
    getRoom: function (roomId) {
      return request({
        method: 'GET',
        resource: '/room/' + roomId + '?expand=participants'
      });
    },

    // Only usable if you have the view_group scope. The best way to get
    // the current user is either to use the getRoom method above or
    // use the client-side JS helpers: https://developer.atlassian.com/hipchat/guide/hipchat-ui-extensions/views/javascript-api#JavascriptAPI-GettingcontextualinformationfromtheHipChatClient
    getUser: function (userId) {
      return request({
        method: 'GET',
        resource: '/user/' + userId
      });
    },

    createUser: function(data) {
      return request({
        method: 'POST',
        resource: '/user',
        body: data
      });
    },

    inviteUser: function(data) {
      return request({
        method: 'POST',
        resource: '/invite/user',
        body: data
      });
    },

    deleteUser: function(userId) {
      return request({
        method: 'DELETE',
        resource: '/user/' + userId
      });
    },

    updateGlance: function (roomId, moduleKey, glance) {
      return request({
        method: 'POST',
        resource: '/addon/ui/room/' + roomId,
        body: {
          "glance": [{
            "key": moduleKey,
            "content": glance
          }]
        }
      });
    }
  };
};
