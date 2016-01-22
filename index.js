'use strict';

/**
 * Serverless Test Plugin
 * - Useful example/starter code for writing a plugin for the Serverless Framework.
 * - In a plugin, you can:
 *    - Create a Custom Action that can be called via the CLI or programmatically via a function handler.
 *    - Overwrite a Core Action that is included by default in the Serverless Framework.
 *    - Add a hook that fires before or after a Core Action or a Custom Action
 *    - All of the above at the same time :)
 *
 * - Setup:
 *    - Make a Serverless Project dedicated for plugin development, or use an existing Serverless Project
 *    - Make a "plugins" folder in the root of your Project and copy this codebase into it. Title it your custom plugin name with the suffix "-dev", like "myplugin-dev"
 *    - Run "npm link" in your plugin, then run "npm link myplugin" in the root of your project.
 *    - Start developing!
 *
 * - Good luck, serverless.com :)
 */

module.exports = function(ServerlessPlugin, serverlessPath) { // Always pass in the ServerlessPlugin Class

	const path      = require('path'),
		fs          = require('fs'),
		BbPromise   = require('bluebird'),
		chalk       = require('chalk'),
		SCli        = require( path.join( serverlessPath, 'utils', 'cli' ) ),
		JUnitWriter = require("junitwriter");

	/**
	 * ServerlessPluginBoierplate
	 */

	class ServerlessPluginBoilerplate extends ServerlessPlugin {

		/**
		 * Constructor
		 * - Keep this and don't touch it unless you know what you're doing.
		 */

		constructor(S) {
			super(S);
		}

		/**
		 * Define your plugins name
		 * - We recommend adding prefixing your personal domain to the name so people know the plugin author
		 */

		static getName() {
			return 'com.serverless.' + ServerlessPluginBoilerplate.name;
		}

		/**
		 * Register Actions
		 * - If you would like to register a Custom Action or overwrite a Core Serverless Action, add this function.
		 * - If you would like your Action to be used programatically, include a "handler" which can be called in code.
		 * - If you would like your Action to be used via the CLI, include a "description", "context", "action" and any options you would like to offer.
		 * - Your custom Action can be called programatically and via CLI, as in the example provided below
		 */

		registerActions() {

			this.S.addAction(this._runFunctionTest.bind(this), {
				handler:       'runFunctionTest',
				description:   'Run tests on a given function',
				context:       'function',
				contextAction: 'test',
				options:       [{ // These must be specified in the CLI like this "-option true" or "-o true"
					option:      'all',
					shortcut:    'a',
					description: 'Test all functions'
				},{
					option:      'out',
					shortcut:    'o',
					description: 'JUnit output file'
				}],
				parameters: [{ // Use paths when you multiple values need to be input (like an array).  Input looks like this: "serverless custom run module1/function1 module1/function2 module1/function3.  Serverless will automatically turn this into an array and attach it to evt.options within your plugin
					parameter: 'paths',
					description: 'One or multiple paths to your function',
					position: '0->' // Can be: 0, 0-2, 0->  This tells Serverless which params are which.  3-> Means that number and infinite values after it.
				}]
			});

			return BbPromise.resolve();
		}

		/**
		 * Register Hooks
		 * - If you would like to register hooks (i.e., functions) that fire before or after a core Serverless Action or your Custom Action, include this function.
		 * - Make sure to identify the Action you want to add a hook for and put either "pre" or "post" to describe when it should happen.
		 */

		registerHooks() {
			return BbPromise.resolve();
		}

		/**
		 * Custom Action Example
		 * - Here is an example of a Custom Action.  Include this and modify it if you would like to write your own Custom Action for the Serverless Framework.
		 * - Be sure to ALWAYS accept and return the "evt" object, or you will break the entire flow.
		 * - The "evt" object contains Action-specific data.  You can add custom data to it, but if you change any data it will affect subsequent Actions and Hooks.
		 * - You can also access other Project-specific data @ this.S Again, if you mess with data on this object, it could break everything, so make sure you know what you're doing ;)
		 */

		_runFunctionTest(evt) {

			let _this = this;
			let context = require("aws-lambda-mock-context");

			return new BbPromise(function (resolve, reject) {

				// SCli.log(evt)           // Contains Action Specific data
				// SCli.log(_this.S)       // Contains Project Specific data
				// SCli.log(_this.S.state) // Contains tons of useful methods for you to use in your plugin.  It's the official API for plugin developers.

				let functions;
				if (evt.options.all) {
					functions = _this.S.state.getFunctions();
				}
				else if (evt.options.paths) {
					functions = _this.S.state.getFunctions({ paths: evt.options.paths });
				}

				if (!functions || functions.length === 0) {
					return reject("You need to specify either a function path or --all to test all functions");
				}

				let testWriter = new JUnitWriter();

				let count = 0, succeeded = 0, failed = 0;
				BbPromise.each(functions, function(f) {
					let funcTestSuite = testWriter.addTestsuite(f._config.sPath);
					count++;

					if (f.runtime === "nodejs") {
						let handler = f.handler.split(".");
						let component = f._config.component;
						let handlerPath = path.join(_this.S.config.projectPath, component, handler[0]);

						if (f.custom.test && f.custom.test.skip) {
							SCli.log("Skipping " + f._config.sPath);
							funcTestSuite.setSkipped(true);
							return; // skip this function
						}

						let code;
						try {
							code = require(handlerPath);
						}
						catch (err) {
							return reject(err);
						}

						let event = {};
						let eventFile = (f.custom.test ? f.custom.test.event : false) || "event.json";
						let eventPath = path.join(f._config.fullPath, eventFile);
						if (fs.statSync(eventPath).isFile())
							event = require(eventPath);

						if (!code[handler[1]]) {
							let err = "Handler function " + f.handler + " not found";
							return reject(err);
						}

						SCli.log("Testing " + f._config.sPath + "...");

						let startTime = Date.now();
						let ctx = context();
						code[handler[1]](event, ctx);

						let testCase = funcTestSuite.addTestcase("should succeed", f.handler);

						return ctx.Promise.then(function(result) {
							let duration = (Date.now() - startTime) / 1000;
							testCase.setTime(duration);
							if (duration > f.timeout)
								testCase.addFailure("Timeout of " + f.timeout + " seconds exceeded", "Error");

							SCli.log(chalk.green("Success!"));
							succeeded++;
						}).catch(function(err) {
							funcTestSuite.addFailure(err.toString(), "Error");
							let duration = (Date.now() - startTime) / 1000;
							testCase.setTime(duration);

							SCli.log(chalk.bgRed.white(" ERROR ") + " " +
									chalk.red(err));
							failed++;
						});
					}
					else {
						SCli.log("Skipping " + f._config.sPath);
						funcTestSuite.setSkipped(true);
					}
				}).then(function() {
					SCli.log("Tests completed: " + chalk.green(String(succeeded) + " succeeded") + " / " +
							chalk.red(String(failed) + " failed") + " / " + 
							chalk.white(String(count - succeeded - failed) + " skipped"));

					if (evt.options.out) {
						// Write test results to file
						let save = BbPromise.promisify(testWriter.save, {context: testWriter});
						return save(evt.options.out).then(function() {
							SCli.log("Test results written to " + evt.options.out);
						});
					}
				}).then(function() {
					resolve(evt);
					process.exit(); // FIXME force exit
				}).catch(function(err) {
					SCli.log(chalk.red(err));
					reject(evt);
				});
			});
		}

	}

	// Export Plugin Class
	return ServerlessPluginBoilerplate;

};

//Godspeed!