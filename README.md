## Local Telegram Bot

This is a local Telegram bot that can handle messages from and share notes with specific Telegram users. It's designed to be used as another way to use Logseq from mobile, when existing sync feature is not available yet for non-iCloud users.

Currently, it's still under heavy development.

## How to use it

1. [Create a Telegram bot](https://core.telegram.org/bots#3-how-do-i-create-a-bot).
2. Complete the setting. The bot token is required. The authorized users is also required to avoid abuse of the bot.
3. Send texts and photos to this bot directly. The texts and photos will be automatically writen to the specified page and inbox
4. **NOTE**: since it's a local bot, the logseq needs to be open all the time, or the bot won't run and the data sent from Telegram might be expired before bot could fetch them.

## Current available features

1. Send text and photo to Logseg
    * inlucindg forward and reply, but only content is sent. Forward from who or reply to what is not.
2. Page and Inbox can be changed from setting page

## Future features

1. Send blocks back to Telegram
2. Send TODO notificaiton
3. Change Page and Inbox from Telegram
4. Fetch customized notes
5. Save and run other commands
6. Support other types of messages
7. Support channel message

## Thanks

It's inspired by [shady2k](https://github.com/shady2k)'s work on [
logseq-inbox-telegram-plugin](https://github.com/shady2k/logseq-inbox-telegram-plugin)