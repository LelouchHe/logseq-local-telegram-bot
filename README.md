## Local Telegram Bot

This is a local Telegram bot that can handle messages from and share notes with specific Telegram users. It's designed to be used as another way to use Logseq from mobile, when existing sync feature is not available yet for non-iCloud users.

Currently, it's still under heavy development.

## How to use it

1. [Create a Telegram bot](https://core.telegram.org/bots#3-how-do-i-create-a-bot).
2. Complete the setting
    * "Bot Token" is required
    * "Is Main Bot" is required for the main Logseq to handle requests from Telegram. If you have multiple Logseq open at same time, probably from different devices, make sure only one of them is set to main bot, to avoid conflicts.
    * "Authorized Users" is also required to avoid abuse of the bot.
3. Send texts and photos to this bot directly. The texts and photos will be automatically writen to the specified page and inbox
4. **NOTE**: since it's a local bot, the logseq needs to be open all the time, or the bot won't run and the data sent from Telegram might be expired before bot could fetch them.

## Current available features

* Send text and photo to Logseg
    * inlucindg forward and reply, but only content is sent. Forward from who or reply to what is not.
* Page and Inbox can be changed from setting page
* Send block and its children blocks to authorized users who have send messages to Logseq before
    * Right-click the block and choose "Local Telegram Bot: Send"
    * This is to get its chat id without asking users to type in
    * Once someone is removed from authorized users, it won't get any message

## Future features

*not a full list, either not ordered by priority*
* Send TODO notification
* Change Page and Inbox from Telegram
* Fetch customized notes
* Save and run other commands
* Support other types of messages
* Support channel message
* Convert non-plain command into correct form (like DEADLINE)
* Send blocks with embed block
* Send page
* Send to specific users, including those un-authorized users

## Contribute

Feel free to raise an issue or create a pull request!

### How to develop it locally
1. install [node](https://nodejs.org/en/) (v19.6 is used by me)
2. clone the repo to local folder
3. `yarn install`
4. `yarn build`
5. enable dev mode in logseq
6. load unpacked pluging from repo folder


## Thanks

It's inspired by [shady2k](https://github.com/shady2k)'s work on [
logseq-inbox-telegram-plugin](https://github.com/shady2k/logseq-inbox-telegram-plugin)