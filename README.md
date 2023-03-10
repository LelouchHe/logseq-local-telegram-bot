## Local Telegram Bot

This is a local Telegram bot plugin that can handle messages from and share notes with eligible Telegram users. It's designed to be used as another way to use Logseq from mobile, when existing sync feature is not available yet for non-iCloud users.

Currently, it's still under heavy development.

## How to use it

1. [Create a Telegram bot](https://core.telegram.org/bots#3-how-do-i-create-a-bot).
2. Complete the setting
    * "Bot Token" is required
    * "Is Main Bot" is required for the main Logseq to handle requests from Telegram. If you have multiple Logseq open at same time, probably from different devices, make sure only one of them is set to main bot, to avoid conflicts.
    * "Authorized Users" is required to stop ineligible users sending messages to your Logseq.
    * "Enable Customized Command" and "Enable Customized Command From Message" are for advanced users, who can create customized ts/datascript to respond to Telegram command. It works on main bot only. They're experimenting features, and could be changed later.
3. Send texts and photos to this bot directly. The texts and photos will be automatically writen to the specified page and inbox
4. **NOTE**: since it's a local bot, the logseq needs to be open all the time, or the bot won't run and the data sent from Telegram might be expired before bot could fetch them.

## Current available features

* Send text and photo to Logseg
    * inlucindg forward and reply, but only content is sent. Forward from who or reply to what is not.
* Page and Inbox can be changed from setting page
* Users can choose to add new messages to the top or bottom of the inbox
* Send block and its children blocks to authorized users who have send messages to Logseq before
    * Right-click the block and choose "Local Telegram Bot: Send"
    * This is to get its chat id without asking users to type in
    * Once someone is removed from authorized users, it won't get any message
* Send not-done task notification at specific time **one day before its time**
    * This is only enabled for **Main Bot**.
    * Task with scheduled time and deadline time are handled separately
    * Users can set the time to send each of the notifications in the settings, or disable this feature by clearing it.
    * If it's set to a future date, the notification will wait until that date comes, regardless of the time. 
    * It now works only with scheduled/deadline.
* Command playgroud is available to debug eligible js/datascript within Logseq.
    * There are 2 slash commands `Local Telegram Bot: Define Customized Query` and `Local Telegram Bot: Define Customized Run` to generate template for query/run, with extra debug button to open playground.
    * Query is for datascript, which looks like advanced query in Logseq, but it only includes query part and optional input, like below
        * ![query](./assets/query.PNG)
        * It returns in JSON
    * Run is for js, which could uses normal js/DOM and Logseq plugin apis. It looks like below
        * ![query](./assets/run.PNG)
        * It has access to `logseq` plugin api, and `await` could be used inside, as shown in the example
        * It returns in JSON
    * Clicking the green arrow opens the playground, where users can debug their datascript or js to make sure it works.
        * ![playground](./assets/playground.PNG)
        * "Signature" is for the selected command. It's readonly, and can be changed out of playground
        * "param0 param1" is the placeholder for actual arguments. no need to type `run_name` any more
        * "Code" region is for normal datascript/js code, with limited highlight and auto-completion
        * Clicking the green arrow will run the code. The result is shown in json in Result region, and exceptions, console logs and console errors are shown in Logs region.
* Customized command system, which enable users to write datascript(query) or ts/js(run) and get response from Telegram by sending command
    * "Enable Customized Command" needs to be enabled. This feature is still experimenting. It might change when it's finalized.
    * Users need to send `/query query_name query_input0 query_input1` or just `/query_name query_input0 query_input1` to invoke above query
    * Users need to send `/run run_name param0 param1` or just `/run_name param0 param1` to invoke above run
    * There is a `/help` command, to list all available commands with their signature and description
    * When "Enable Customized Command From Message" is also enabled, users are able to add new commands from Telegram directly, as long as its format is 

## Future features

*not a full list, either not ordered by priority*
* Change Page and Inbox from Telegram
* Fetch customized notes
* Support other types of messages
* Support channel message
* Convert non-plain command into correct form (like DEADLINE)
* Send blocks with embed block
* Send page
* Send to specific users, including those un-authorized users
* More time control over TODO notification
* Use Agenda-plugin-style date, instead of builtin date 
* Update task status from Telegram
* Add more builtin commands
* Add auto-complete for datascript and Logseq data schema

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