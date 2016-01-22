Serverless Plugin Boilerplate
=============================

This is a starter project to help you build plugins for the Serverless Framework.  You can install this boilerplate Plugin in its current form into your Serverless Projects and it will run.  All that's left for you to do is write your custom logic.  We've filled this with useful comments to help you along your way.  Also, the entire Serverless Framework is comprised of Plugins.  When you write your own Plugin, it's no hack, you're simply extending and customizing the Serverless Framework to suite your needs and build processes :)

**Note:** Serverless *v0.1.0* or higher is required.

**A Serverless Plugin can do the following:**

* Add a Custom Action to the Serverless Framework which can be called via the command line, programatically via a handler, or both.
* Add a Custom Action that overwrites a Core Action in the Serverless Framework.
* Add a Custom Hook that fires *before* or *after* a Core Action or a Custom Action.

One plugin can do all of the above, and include several Hooks and Actions at once.

###Get Started

* Plugins must be written in a Serverless Project, so create one specifically for authoring/testing plugins, or write your plugin in a Project you are working on, and make sure you are using Serverless `v0.1.0` or greater.

* cd into your Serverless Project, create a "plugins" folder and download this boilerplate project into it.  The "plugins" folder is specifically for developing plugins.  Give this boilerplate's folder a custom title.

* Update the boilerplate's `package.json` "name" property with your plugin's name.

* cd into your new plugin and run:
```
npm link
```

* cd into your Serverless Project's root folder and run:
```
npm link <yourpluginname>
```

* Lastly, open the 's-project.json' in your Project's root folder and add the plugin to the `plugins` property, like this:

```
"plugins": [
	"my-custom-plugin"
]
```

* Use the Serverless CLI within your project and run `serverless` to see the help screen.  You should now see an option entitled `custom` with a `run` Action.  This was added by the boilerplate plugin.

* Now, your custom plugin is installed and ready to be worked on!  Read the comments in the `index.js` for further instructions.

If you would like to learn more about plugins, please check out our [Documentation](http://docs.serverless.com).

Good luck! - [Serverless](http://www.serverless.com)
