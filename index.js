'use strict';

/**
 * Serverless Test Plugin
 */

module.exports = function(ServerlessPlugin, serverlessPath) { // Always pass in the ServerlessPlugin Class

	const path      = require('path'),
		fs          = require('fs'),
		BbPromise   = require('bluebird'),
		chalk       = require('chalk'),
		SError      = require(path.join(serverlessPath, 'ServerlessError')),
		SUtils      = require(path.join(serverlessPath, 'utils')),
		SCli        = require( path.join( serverlessPath, 'utils', 'cli' ) ),
		context     = require( path.join( serverlessPath, 'utils', 'context' ) ),
		JUnitWriter = require("junitwriter"),
		intercept   = require("intercept-stdout");

	/**
	 * ServerlessPluginBoierplate
	 */

	class ServerlessTestPlugin extends ServerlessPlugin {

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
			return 'com.serverless.' + ServerlessTestPlugin.name;
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

			return new BbPromise(function (resolve, reject) {

				// Prepare result object
				evt.data.result = { status: false };

				// Instantiate Classes
				let functions;
				if (evt.options.all) {
					// Load all functions
					functions = _this.S.state.getFunctions();
				}
				else if (evt.options.paths) {
					// Load individual functions as specified in command line
					functions = _this.S.state.getFunctions({ paths: evt.options.paths });
				}

				if (!functions || functions.length === 0) {
					return BbPromise.reject(new SError(
							"You need to specify either a function path or --all to test all functions",
							SError.errorCodes.INVALID_PROJECT_SERVERLESS
					));
				}

				// Iterate all functions, execute their handler and
				// write the results into a JUnit file...
				let junitWriter = new JUnitWriter();
				let count = 0, succeeded = 0, failed = 0;
				BbPromise.each(functions, function(functionData) {
					let functionTestSuite = junitWriter.addTestsuite(functionData._config.sPath);
					count++;

					if (functionData.runtime === "nodejs") {
						// Load function file & handler
						let functionFile    = functionData.handler.split('/').pop().split('.')[0];
						let functionHandler = functionData.handler.split('/').pop().split('.')[1];
						let functionPath    = path.join(_this.S.config.projectPath, functionData._config.sPath);
						functionFile        = path.join(functionPath, (functionFile + '.js'));

						// Fire function
						let eventFile     = (functionData.custom.test ? 
								functionData.custom.test.event : false) || "event.json";
						let functionEvent = SUtils.readAndParseJsonSync(path.join(functionPath, eventFile));

						// TODO Should we skip a function that's explicitly specified via command line option?
						if (functionData.custom.test && functionData.custom.test.skip) {
							SCli.log(`Skipping ${functionData._config.sPath}`);
							functionTestSuite.addTestcase("skipped", functionData._config.sPath);
							functionTestSuite.setSkipped(true);
							return; // skip this function
						}

						return new BbPromise(function(resolve) {
							try {
								// Load the handler code
								functionHandler = require(functionFile)[functionHandler];
								if (!functionHandler) {
									let msg = `Handler function ${functionData.handler} not found`;
									SCli.log(chalk.bold(msg));
									evt.data.result.status   = 'error';
									evt.data.result.response = msg;
									return resolve();
								}

								// Okay, let's go and execute the handler
								// We intercept all stdout from the function and dump
								// it into our test results instead.
								SCli.log(`Testing ${functionData._config.sPath}...`);
								let testCase = functionTestSuite.addTestcase("should succeed", functionData._config.sPath);
								let capturedText = "";
								let unhookIntercept = intercept(function(txt) {
									capturedText += txt;
								});
		
								let startTime = Date.now();
								functionHandler(functionEvent, context(functionData.name, function (err, result) {

									let duration = (Date.now() - startTime) / 1000;
									unhookIntercept(); // stop intercepting stdout

									testCase.setSystemOut(capturedText);
									testCase.setTime(duration);

									// Show error
									if (err) {
										testCase.addFailure(err.toString(), "Failed");

										// Done with errors.
										SCli.log(chalk.bgRed.white(" ERROR ") + " " +
												chalk.red(err.toString()));
										failed++;
									}
									else if (duration > functionData.timeout) {
										let msg = `Timeout of ${functionData.timeout} seconds exceeded`;
										testCase.addFailure(msg, "Timeout");

										SCli.log(chalk.bgMagenta.white(" TIMEOUT ") + " " + 
												chalk.magenta(msg));
										failed++;
									}
									else {
										// Done.
										SCli.log(chalk.green("Success!"));
										succeeded++;
									}

									return resolve();
								}));
							}
							catch (err) {

								SCli.log("-----------------");

								SCli.log(chalk.bold("Failed to Run Handler - This Error Was Thrown:"));
								SCli.log(err);
								evt.data.result.status   = 'error';
								evt.data.result.response = err.message;
								return resolve();
							}
						});
					}
					else {
						SCli.log("Skipping " + functionData._config.sPath);
						functionTestSuite.setSkipped(true);
					}
				}).then(function() {

					SCli.log("-----------------");

					// All done. Print a summary and write the test results
					SCli.log("Tests completed: " + 
							chalk.green(String(succeeded) + " succeeded") + " / " +
							chalk.red(String(failed) + " failed") + " / " + 
							chalk.white(String(count - succeeded - failed) + " skipped"));

					if (evt.options.out) {
						// Write test results to file
						return new BbPromise(function(resolve) {
							junitWriter.save(evt.options.out, function() {
								SCli.log("Test results written to " + evt.options.out);
								resolve();
							});
						});
					}
				}).then(function() {
					resolve();
					process.exit(); // FIXME force exit
				}).catch(function(err) {

					SCli.log("-----------------");

					SCli.log(chalk.bold("Failed to Run Tests - This Error Was Thrown:"));
					SCli.log(err);
					evt.data.result.status   = 'error';
					evt.data.result.response = err.message;
					return resolve();
				});
			});
		}

	}

	// Export Plugin Class
	return ServerlessTestPlugin;

};
