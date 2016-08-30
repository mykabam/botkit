var CoreBot = require(__dirname + '/CoreBot.js');
var Slackbot = require(__dirname + '/SlackBot.js');
var Hipchatbot = require(__dirname + '/HipchatBot.js');
var Facebookbot = require(__dirname + '/Facebook.js');
var TwilioIPMbot = require(__dirname + '/TwilioIPMBot.js');

module.exports = {
    core: CoreBot,
    slackbot: Slackbot,
    hipchatbot: Hipchatbot,
    facebookbot: Facebookbot,
    twilioipmbot: TwilioIPMbot,
};
