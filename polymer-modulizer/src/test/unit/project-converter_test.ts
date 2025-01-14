/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import {assert} from 'chai';
import * as esprima from 'esprima';
import * as estree from 'estree';
import {Analyzer, InMemoryOverlayUrlLoader} from 'polymer-analyzer';

import {createDefaultConversionSettings, PartialConversionSettings} from '../../conversion-settings';
import {getPackageDocuments} from '../../convert-package';
import {getMemberPath} from '../../document-util';
import {ProjectConverter} from '../../project-converter';
import {PackageUrlHandler} from '../../urls/package-url-handler';
import {PackageType} from '../../urls/types';

/*
A few conventions in these tests:
  - Most are written as two calls, setSources and assertSources.
    The first defines the code we're converting, the second asserts
    on the output of the conversion.
  - test.html is considered a `main` file. If it's given in setSources it
    will be converted to js even if it's not imported by anything else.
  - index.html is the convention for a file that is intended to be maintained
    as HTML.
 */

suite('AnalysisConverter', () => {

  suite('convertDocument', () => {

    let urlLoader: InMemoryOverlayUrlLoader;
    let analyzer: Analyzer;

    setup(() => {
      urlLoader = new InMemoryOverlayUrlLoader();
      analyzer = new Analyzer({urlLoader: urlLoader});
    });

    function interceptWarnings() {
      const warnings: string[] = [];
      const originalConsoleWarn = console.warn;
      const originalConsoleErr = console.error;

      console.warn = console.error = (...args: any[]) => {
        warnings.push(args.join(''));
      };

      return function unintercept() {
        console.warn = originalConsoleWarn;
        console.error = originalConsoleErr;
        return warnings;
      };
    }

    interface TestConversionOptions extends PartialConversionSettings {
      packageName: string;
      packageType: PackageType;
      expectedWarnings: string[];
    }

    async function convert(
        partialOptions: Partial<TestConversionOptions> = {}) {
      // Extract options & settings /w defaults.
      const packageName = partialOptions.packageName || 'some-package';
      const packageType = partialOptions.packageType || 'element';
      const expectedWarnings = partialOptions.expectedWarnings || [];
      const partialSettings: PartialConversionSettings = {
        namespaces: partialOptions.namespaces || ['Polymer'],
        excludes: partialOptions.excludes,
        referenceExcludes: partialOptions.referenceExcludes,
        addImportPath: partialOptions.addImportPath,
      };
      // Analyze all given files.
      const allTestUrls = [...urlLoader.urlContentsMap.keys()];
      const analysis = await analyzer.analyze(allTestUrls);
      // Setup ConversionSettings, set "test.html" as default entrypoint.
      const conversionSettings =
          createDefaultConversionSettings(analysis, partialSettings);
      conversionSettings.includes.add('test.html');
      // Setup ProjectConverter, use PackageUrlHandler for easy setup.
      const urlHandler = new PackageUrlHandler(packageName, packageType);
      const converter =
          await new ProjectConverter(urlHandler, conversionSettings);
      // Gather all relevent package documents, and run the converter!
      const stopIntercepting = interceptWarnings();
      for (const doc of getPackageDocuments(analysis, conversionSettings)) {
        converter.convertDocument(doc);
      }
      // Assert warnings matched expected.
      const warnings = stopIntercepting();
      assert.deepEqual(
          warnings,
          expectedWarnings,
          'console.warn() and console.error() calls differ from expected.');
      // Return results for assertion.
      return converter.getResults();
    }

    function assertSources(
        results: Map<string, string|undefined>,
        expected: {[path: string]: string|undefined}) {
      for (const [expectedPath, expectedContents] of Object.entries(expected)) {
        assert.isTrue(
            results.has(expectedPath),
            `No output named ${expectedPath} was generated. ` +
                `Generated outputs: ${[...results.keys()].join(', ')}`);
        const actualContents = results.get(expectedPath);
        if (actualContents === undefined) {
          assert.deepEqual(
              actualContents,
              expectedContents,
              `${expectedPath} was unexpectedly deleted!`);
        } else if (expectedContents === undefined) {
          assert.deepEqual(
              actualContents,
              expectedContents,
              `${expectedPath} should have been deleted`);
        } else {
          assert.deepEqual(
              '\n' + actualContents,
              expectedContents,
              `Content of ${expectedPath} is wrong`);
        }
      }
    }

    function setSources(sources: {[filename: string]: string}) {
      for (const [filename, source] of Object.entries(sources)) {
        urlLoader.urlContentsMap.set(filename, source);
      }
    }

    test('converts imports to .js', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./dep.html">
          <link rel="import" href="../dep/dep.html">
          <script></script>
        `,
        'dep.html': `<h1>Hi</h1>`,
        'bower_components/dep/dep.html': `<h1>Hi</h1>`,
      });
      const expectedWarnings = [
        `WARN: bower->npm mapping for "dep" not found`,
      ];
      assertSources(await convert({expectedWarnings}), {
        'test.js': `
import './dep.js';
import '../dep/dep.js';
`,
        'test.html': undefined
      });
    });

    test('converts dependency imports for an element', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./nested/test.html">
          <link rel="import" href="../app-storage/app-storage.html">
          <script></script>
        `,
        'nested/test.html': `
          <link rel="import" href="../../app-route/app-route.html">
          <script></script>
        `,
        'bower_components/app-storage/app-storage.html': `<h1>Hi</h1>`,
        'bower_components/app-route/app-route.html': `<h1>Hi</h1>`,
      });
      assertSources(await convert(), {
        'test.js': `
import './nested/test.js';
import '../@polymer/app-storage/app-storage.js';
`,
        'nested/test.js': `
import '../../@polymer/app-route/app-route.js';
`,
        'test.html': undefined,
        'nested/test.html': undefined,
      });
    });

    test(
        'converts dependency imports for an element with a scoped package name',
        async () => {
          setSources({
            'test.html': `
          <link rel="import" href="./nested/test.html">
          <link rel="import" href="../app-storage/app-storage.html">
          <script></script>
        `,
            'nested/test.html': `
          <link rel="import" href="../../app-route/app-route.html">
          <script></script>
        `,
            'bower_components/app-route/app-route.html': `<h1>Hi</h1>`,
            'bower_components/app-storage/app-storage.html': `<h1>Hi</h1>`,
          });
          assertSources(
              await convert({packageName: '@some-scope/some-package'}), {
                'test.js': `
import './nested/test.js';
import '../../@polymer/app-storage/app-storage.js';
`,
                'nested/test.js': `
import '../../../@polymer/app-route/app-route.js';
`
              });
        });

    test('converts dependency imports for an npm application', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./nested/test.html">
          <link rel="import" href="./bower_components/app-storage/app-storage.html">
          <link rel="import" href="/bower_components/app-route/app-route.html">
          <script></script>
        `,
        'nested/test.html': `
          <link rel="import" href="../bower_components/app-storage/app-storage.html">
          <link rel="import" href="/bower_components/app-route/app-route.html">
          <script></script>
        `,
        'bower_components/app-route/app-route.html': `<h1>Hi</h1>`,
        'bower_components/app-storage/app-storage.html': `<h1>Hi</h1>`,
      });
      assertSources(await convert({packageType: 'application'}), {
        'test.js': `
import './nested/test.js';
import './node_modules/@polymer/app-storage/app-storage.js';
import '/node_modules/@polymer/app-route/app-route.js';
`,
        'nested/test.js': `
import '../node_modules/@polymer/app-storage/app-storage.js';
import '/node_modules/@polymer/app-route/app-route.js';
`,
      });
    });

    test(
        'converts dependency imports for an npm application with a scoped package name',
        async () => {
          setSources({
            'test.html': `
          <link rel="import" href="./nested/test.html">
          <link rel="import" href="./bower_components/app-storage/app-storage.html">
          <link rel="import" href="/bower_components/app-route/app-route.html">
          <script></script>
        `,
            'nested/test.html': `
          <link rel="import" href="../bower_components/app-storage/app-storage.html">
          <link rel="import" href="/bower_components/app-route/app-route.html">
          <script></script>
        `,
            'bower_components/app-route/app-route.html': `<h1>Hi</h1>`,
            'bower_components/app-storage/app-storage.html': `<h1>Hi</h1>`,
          });
          assertSources(await convert({packageType: 'application'}), {
            'test.js': `
import './nested/test.js';
import './node_modules/@polymer/app-storage/app-storage.js';
import '/node_modules/@polymer/app-route/app-route.js';
`,
            'nested/test.js': `
import '../node_modules/@polymer/app-storage/app-storage.js';
import '/node_modules/@polymer/app-route/app-route.js';
`,
          });
        });

    test('converts imports to .js without scripts', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./dep.html">
        `,
        'dep.html': `<h1>Hi</h1>`,
      });
      assertSources(await convert(), {
        'test.js': `
import './dep.js';
`
      });
    });

    test('deletes import wrappers', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./foo.html">
        `,
        'foo.html': `
          <script src="foo.js"></script>
        `,
        'foo.js': `
console.log('foo');
`,
      });
      assertSources(await convert(), {
        'test.js': `
import './foo.js';
`
      });
    });

    test('converts implicit imports to .js', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./foo.html">
          <script>
            console.log(Polymer.foo);
            console.log(Polymer.bar);
          </script>
        `,
        'foo.html': `
          <link rel="import" href="./bar.html">
          <script>
            Polymer.foo = 42;
          </script>
        `,
        'bar.html': `
          <script>
            Polymer.bar = 'Life, Universe, Everything';
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import { foo } from './foo.js';
import { bar } from './bar.js';
console.log(foo);
console.log(bar);
`
      });
    });

    test('imports namespace itself if called directly', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./foo.html">
          <script>
            console.log(window.Polymer());
            console.log(Polymer());
            console.log(Polymer.foo);
            console.log(Polymer['bar']);
          </script>
        `,
        'foo.html': `
          <script>
            window.Polymer = function() {};
            Polymer.foo = 42;
            Polymer.bar = 43;
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import { Polymer, foo } from \'./foo.js\';
console.log(Polymer());
console.log(Polymer());
console.log(foo);
console.log(Polymer[\'bar\']);
`
      });
    });

    test('imports namespace itself if called indirectly', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./foo.html">
          <script>
            var P = Polymer;
            var Po = window.Polymer;
            P();
            Po();
          </script>
        `,
        'foo.html': `
          <script>
            window.Polymer = function() {};
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import { Polymer } from './foo.js';
var P = Polymer;
var Po = Polymer;
P();
Po();
`
      });
    });

    test('imports _polymerFn as Polymer from polymer-fn.js', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./polymer.html">
          <script>
            console.log(window.Polymer());
            console.log(Polymer());
          </script>
        `,
        'polymer.html': `
          <link rel="import" href="./lib/legacy/polymer-fn.html">
        `,
        'lib/legacy/polymer-fn.html': `
          <script>
            window.Polymer._polymerFn = function(info) {
              console.log("hey there, i'm the polymer function!");
            };
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import './polymer.js';
import { Polymer } from './lib/legacy/polymer-fn.js';
console.log(Polymer());
console.log(Polymer());
`,

        'polymer.js': `
import './lib/legacy/polymer-fn.js';
`,

        'lib/legacy/polymer-fn.js': `
export const Polymer = function(info) {
  console.log("hey there, i\'m the polymer function!");
};
`
      });
    });


    test('unwraps top-level IIFE', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';

              console.log('a statement');
            })();
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
console.log('a statement');
`
      });
    });

    test('exports a reference', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';

              Polymer.ArraySelectorMixin = ArraySelectorMixin;
            })();
          </script>`
      });
      assertSources(await convert(), {
        'test.js': `
export { ArraySelectorMixin };
`
      });
    });

    test('exports a value to a nested namespace', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              window.Polymer.version = '2.0.0';
            })();
          </script>`
      });
      assertSources(await convert(), {
        'test.js': `
export const version = '2.0.0';
`
      });
    });

    test('exports the result of a function call', async () => {
      setSources({
        'test.html': `
          <script>
            Polymer.LegacyElementMixin = Polymer.dedupingMixin();
          </script>`
      });
      assertSources(await convert(), {
        'test.js': `
export const LegacyElementMixin = Polymer.dedupingMixin();
`
      });
    });

    test('exports a namespace object\'s properties', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';

              /**
               * @memberof Polymer.Namespace
               */
              function independentFn() {}

              /**
               * @namespace
               * @memberof Polymer
               */
              Polymer.Namespace = {
                literal: 42,
                arr: [],
                obj: {},
                meth() {},
                func: function() {},
                arrow: () => {},
                independentFn: independentFn,
              };
            })();
          </script>`,
      });
      assertSources(await convert(), {
        'test.js': `
/**
 * @memberof Polymer.Namespace
 */
function independentFn() {}

export const literal = 42;
export const arr = [];
export const obj = {};
export function meth() {}
export function func() {}
export const arrow = () => {};
export { independentFn };
`
      });
    });

    test('modifies `this` references correctly for exports', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';
              /**
               * @namespace
               * @memberof Polymer
               */
              const Namespace = {
                fn: function() {
                  this.foobar();
                },
                // NOTE: this is not a valid reference to Namespace.foobar
                isArrowFn: () => {
                  this.foobar();
                },
                ifBlock: function() {
                  if (this.foobar) {
                    this.foobar();
                  }
                },
                iffeFn: function() {
                  (function() {
                    this.foobar();
                  })();
                },
                inlineFn: function() {
                  function inline() {
                    this.foobar();
                  }
                  inline();
                },
                arrowFn: function() {
                  const baz = () => {
                    this.foobar();
                  };
                },
              };
              Polymer.Namespace = Namespace;
            })();
          </script>`,
      });
      assertSources(await convert(), {
        'test.js': `
export function fn() {
  foobar();
}

export const isArrowFn = () => {
  this.foobar();
};

export function ifBlock() {
  if (foobar) {
    foobar();
  }
}

export function iffeFn() {
  (function() {
    this.foobar();
  })();
}

export function inlineFn() {
  function inline() {
    this.foobar();
  }
  inline();
}

export function arrowFn() {
  const baz = () => {
    foobar();
  };
}
`
      });
    });


    test(
        'exports a namespace object and fixes local references to its properties',
        async () => {
          setSources({
            'test.html': `
          <script>
            (function() {
              'use strict';
              /**
               * @namespace
               */
              Polymer.Namespace = {
                meth() {},
                polymerReferenceFn: function() {
                  return Polymer.Namespace.meth();
                },
                thisReferenceFn: function() {
                  return this.meth();
                },
              };
            })();
          </script>`,
          });
          assertSources(await convert(), {
            'test.js': `
export function meth() {}

export function polymerReferenceFn() {
  return meth();
}

export function thisReferenceFn() {
  return meth();
}
`
          });
        });

    test('exports a mutable reference if set via mutableExports', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';
              /**
               * @namespace
               */
              Polymer.Namespace = {
                immutableLiteral: 42,
                mutableLiteral: 0,
                increment() {
                  Polymer.Namespace.mutableLiteral++;
                },
              };
            })();
          </script>`,
      });
      assertSources(await convert(), {
        'test.js': `
export const immutableLiteral = 42;
export let mutableLiteral = 0;

export function increment() {
  mutableLiteral++;
}
`
      });
    });


    test('exports a namespace function and its properties', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';
              /**
               * @namespace
               * @memberof Polymer
               */
              Polymer.dom = function() {
                return 'Polymer.dom result';
              };
              /**
               * @memberof Polymer.dom
               */
              Polymer.dom.subFn = function() {
                return 'Polymer.dom.subFn result';
              };
            })();
          </script>`,
      });
      assertSources(await convert(), {
        'test.js': `
export const dom = function() {
  return 'Polymer.dom result';
};

export const subFn = function() {
  return 'Polymer.dom.subFn result';
};
`
      });
    });

    let testName =
        'exports a namespace function and fixes references to its properties';
    test(testName, async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';
              /**
               * @namespace
               * @memberof Polymer
               */
              Polymer.dom = function() {
                return 'Polymer.dom result';
              };
              /**
               * @memberof Polymer.dom
               */
              Polymer.dom.subFn = function() {
                return 'Polymer.dom.subFn result';
              };
              /**
               * @memberof Polymer.dom
               */
              Polymer.dom.subFnDelegate = function() {
                return 'Polymer.dom.subFnDelegate delegates: ' + Polymer.dom() + Polymer.dom.subFn();
              };
            })();
          </script>`,
      });
      assertSources(await convert(), {
        'test.js': `
export const dom = function() {
  return 'Polymer.dom result';
};

export const subFn = function() {
  return 'Polymer.dom.subFn result';
};

export const subFnDelegate = function() {
  return 'Polymer.dom.subFnDelegate delegates: ' + dom() + subFn();
};
`
      });
    });

    test('exports a referenced namespace', async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              'use strict';
              /**
               * @namespace
               * @memberof Polymer
               */
              const Namespace = {
                obj: {
                  deepFunc: function() {},
                },
                func: function() {},
                localReferencingFunc: function() {
                  return Namespace.func();
                },
                globalReferencingFunc: function() {
                  return Polymer.Namespace.func();
                },
                thisReferenceFn: function() {
                  this.func();
                },
                deepReferenceFn: function() {
                  this.obj.deepFunc();
                },
              };
              Polymer.Namespace = Namespace;
            })();
          </script>`,
      });
      assertSources(await convert(), {
        'test.js': `
export const obj = {
  deepFunc: function() {},
};

export function func() {}

export function localReferencingFunc() {
  return func();
}

export function globalReferencingFunc() {
  return func();
}

export function thisReferenceFn() {
  func();
}

export function deepReferenceFn() {
  obj.deepFunc();
}
`
      });
    });


    test('specifies referenced imports in import declarations', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./dep.html">
          <script>
            class MyElement extends Polymer.Element {}
          </script>
        `,
        'dep.html': `
          <script>
            Polymer.Element = {};
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import { Element } from './dep.js';
class MyElement extends Element {}
`
      });
    });

    test('uses imports from namespaces', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./dep.html">
          <script>
            class MyElement extends Polymer.Foo.Element {}
          </script>
        `,
        'dep.html': `
          <script>
            /**
             * @namespace
             */
            Polymer.Foo = {
              Element: {},
            };
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import { Element } from './dep.js';
class MyElement extends Element {}
`
      });
    });

    test('rewrites references to namespaces', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./dep.html">
          <script>
            const Foo = Polymer.Foo;
            class MyElement extends Foo.Element {}
          </script>
        `,
        'dep.html': `
          <script>
            /**
             * @namespace
             */
            Polymer.Foo = {
              Element: {},
            };
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import * as dep from './dep.js';
const Foo = dep;
class MyElement extends Foo.Element {}
`
      });
    });

    test('handles both named imports and namespace imports', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./dep.html">
          <script>
            const Foo = Polymer.Foo;
            const Bar = Foo.Element;
            const Baz = Polymer.Foo.Element;
          </script>
        `,
        'dep.html': `
          <script>
            /**
             * @namespace
             */
            Polymer.Foo = {
              Element: {},
            };
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
import * as dep from './dep.js';
import { Element as Element$0 } from './dep.js';
const Foo = dep;
const Bar = Foo.Element;
const Baz = Element$0;
`
      });
    });

    test('handles re-exports in namespaces', async () => {
      setSources({
        'test.html': `
          <script>
            /**
             * @namespace
             * @memberof Polymer
             */
            const Path = {
              isPath() {}
            };
            Path.isDeep = Path.isPath;
            Polymer.Path = Path;
          </script>
        `,
      });
      assertSources(await convert(), {
        'test.js': `
export function isPath() {}
export const isDeep = isPath;
`
      });
    });

    test('excludes excluded files', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./exclude.html">
          <link rel="import" href="./dep.html">
          <script>
            class MyElement extends Polymer.Element {}
          </script>
        `,
        'dep.html': `
          <script>
            Polymer.Element = {};
          </script>
        `,
        'exclude.html': `
          <script>"no no no";</script>
        `,
      });
      assertSources(
          await convert({
            namespaces: ['Polymer'],
            excludes: ['exclude.html'],
          }),
          {
            'test.js': `
import { Element } from './dep.js';
class MyElement extends Element {}
`
          });
    });

    test('excludes excluded references', async () => {
      setSources({
        'test.html': `
          <script>
            if (Polymer.DomModule) {}
          </script>
        `,
      });
      assertSources(
          await convert({
            namespaces: ['Polymer'],
            referenceExcludes: ['Polymer.DomModule']
          }),
          {
            'test.js': `
if (undefined) {}
`
          });
    });

    test('handles excluded exported references', async () => {
      setSources({
        'test.html': `
          <script>
            Polymer.Settings = settings;
          </script>
        `,
      });
      assertSources(
          await convert({
            namespaces: ['Polymer'],
            referenceExcludes: ['Polymer.Settings'],
          }),
          {
            'test.js': `
export { settings as Settings };
`
          });
    });

    test.skip('handles excluded local namespace references', async () => {
      setSources({
        'test.html': `
          <script>
            let rootPath;

            /**
             * @memberof Polymer
             */
            Polymer.rootPath = rootPath;

            /**
             * @memberof Polymer
             */
            Polymer.setRootPath = function(path) {
              Polymer.rootPath = path;
            }
          </script>
        `,
      });
      assertSources(
          await convert({
            namespaces: ['Polymer'],
            referenceExcludes: ['Polymer.rootPath'],
          }),
          {
            'test.js': `
let rootPath;
export { rootPath };
export const setRootPath = function(path) {
  rootPath = path;
};
`
          });
    });

    test('inlines templates into class-based Polymer elements', async () => {
      setSources({
        'html-tag.html': `
            <script>
              /**
               * @memberof Polymer
               */
              Polymer.html = function() {};
            </script>`,
        'polymer.html': `
            <link rel="import" href="./html-tag.html">
            <script>
              /** @namespace */
              const Polymer = {};
              /** @memberof Polymer */
              Polymer.Element = class Element {}
              Polymer.html = Polymer.html;
            </script>`,
        'test.html': `
<link rel="import" href="./polymer.html">
<dom-module id="test-element">
  <template>
    <h1>Hi!</h1>
    <div>
      This template has multiple lines.<br>
      This template contains duplicated special characters: \` \$ \` \$
    </div>
  </template>
  <script>
    /**
     * @customElement
     * @polymer
     */
    class TestElement extends Polymer.Element {
      static get is() { return 'test-element'; }
    }
  </script>
</dom-module>
`,
      });
      assertSources(await convert(), {
        'test.js': `
import { html, Element } from './polymer.js';
/**
 * @customElement
 * @polymer
 */
class TestElement extends Element {
  static get template() {
    return html\`
    <h1>Hi!</h1>
    <div>
      This template has multiple lines.<br>
      This template contains duplicated special characters: \\\` \\$ \\\` \\$
    </div>
\`;
  }

  static get is() { return 'test-element'; }
}
`
      });
    });

    test('inlines templates into factory-based Polymer elements', async () => {
      setSources({
        'html-tag.html': `
            <script>
              /**
               * @memberof Polymer
               */
              Polymer.html = function() {};
            </script>`,
        'polymer.html': `
            <link rel="import" href="./html-tag.html">
            <script>
              /** @global */
              window.Polymer = function() {}
              Polymer.html = Polymer.html;
            </script>`,
        'test.html': `
  <link rel="import" href="./polymer.html">
  <dom-module id="test-element">
    <template>
      <h1>Hi!</h1>
    </template>
    <script>
      Polymer({
        is: 'test-element',
      });
    </script>
  </dom-module>
`,
      });

      assertSources(await convert(), {
        'test.js': `
import { Polymer, html } from './polymer.js';
Polymer({
  _template: html\`
      <h1>Hi!</h1>
\`,

  is: 'test-element'
});
`
      });
    });

    test('adds importPath to class-based Polymer elements', async () => {
      setSources({
        'test.html': `
<script>
  /**
   * @customElement
   * @polymer
   */
  class TestElement extends Polymer.Element {
  }
</script>
`,
      });
      assertSources(
          await convert({
            addImportPath: true,
          }),
          {
            'test.js': `
/**
 * @customElement
 * @polymer
 */
class TestElement extends Polymer.Element {
  static get importPath() {
    return import.meta.url;
  }
}
`
          });
    });

    test('adds importPath to class-based Polymer elements', async () => {
      setSources({
        'test.html': `
<script>
  Polymer({
  });
</script>
`,
      });

      assertSources(
          await convert({
            addImportPath: true,
          }),
          {
            'test.js': `
Polymer({
  importPath: import.meta.url
});
`
          });
    });

    test('converts arbitrary elements', async () => {
      setSources({
        'test.html': `
<custom-style><style>foo{}</style></custom-style>
<link rel="import" href="./foo.html">
`,
        'foo.html': `<div>hello world!</div>`
      });
      assertSources(await convert(), {
        'test.js': `
import './foo.js';
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');
$_documentContainer.innerHTML = \`<custom-style><style>foo{}</style></custom-style>\`;
document.head.appendChild($_documentContainer);
`,
        'foo.js': `
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');
$_documentContainer.innerHTML = \`<div>hello world!</div>\`;
document.head.appendChild($_documentContainer);
`
      });
    });

    test('converts multiple namespaces', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./qux.html">
          <script>
            Foo.bar = 10;
            Baz.zug = Foo.qux;
          </script>
        `,
        'qux.html': `<script>Foo.qux = 'lol';</script>`
      });
      assertSources(await convert({namespaces: ['Foo', 'Baz']}), {
        'test.js': `
import { qux } from './qux.js';
export const bar = 10;
export { qux as zug };
`
      });
    });

    test('converts declared namespaces', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./polymer.html">
          <script>
            class Element extends Polymer.Element {};
          </script>
        `,
        'polymer.html': `
          <script>
            /** @namespace */
            const Polymer = {};
            Polymer.Element = class Element {}
          </script>
        `
      });
      assertSources(
          await convert({namespaces: [/* No explicit namespaces! */]}), {
            'test.js': `
import { Element as Element$0 } from './polymer.js';
class Element extends Element$0 {}
`,

            'polymer.js': `
export const Element = class Element {};
`
          });
    });

    test('converts declared nested namespaces', async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./ns.html">
          <script>
            class Element extends NS.SubSpace.Element {};
          </script>
        `,
        'ns.html': `
          <script>
            /** @namespace */
            const NS = {};
            /** @namespace */
            NS.SubSpace = {};
            NS.SubSpace.Element = class Element {}
          </script>
        `
      });
      assertSources(
          await convert({namespaces: [/* No explicit namespaces! */]}), {
            'test.js': `
import { Element as Element$0 } from './ns.js';
class Element extends Element$0 {}
`,

            'ns.js': `
export const Element = class Element {};
`
          });
    });

    test('converts unimported html to use script type=module', async () => {
      setSources({
        'test.html': `
                <script>
                  Polymer.Element = class Element {};
                </script>`,
        'index.html': `
                <link rel="import" href="./test.html">

                <div>Hello world!</div>`
      });
      assertSources(await convert(), {
        'test.js': `
export const Element = class Element {};
`,

        'index.html': `

                <script type="module" src="./test.js"></script>

                <div>Hello world!</div>`
      });
    });

    test('converts multiple scripts in one html file', async () => {
      setSources({
        'test.html': `
<link rel="import" href="./polymer.html">
<script>
  class FooElem extends Polymer.Element {};
</script>
<script>
  class BarElem extends Polymer.Element {};
</script>
`,
        'polymer.html': `
<script>
  Polymer.Element = class Element {};
</script>
`
      });
      assertSources(await convert(), {
        'test.js': `
import { Element } from './polymer.js';
class FooElem extends Element {}
class BarElem extends Element {}
`
      });
    });

    test('converts interspersed html and scripts', async () => {
      setSources({
        'test.html': `
<link rel="import" href="./polymer.html">
<div>Top</div>
<script>
  class FooElem extends Polymer.Element {};
</script>
<div>Middle</div>
<script>
  class BarElem extends Polymer.Element {};
</script>
<div>Bottom</div>
`,
        'polymer.html': `
<script>
  Polymer.Element = class Element {};
</script>
`
      });
      assertSources(await convert(), {
        'test.js': `
import { Element } from './polymer.js';
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');
$_documentContainer.innerHTML = \`<div>Top</div><div>Middle</div><div>Bottom</div>\`;
document.head.appendChild($_documentContainer);
class FooElem extends Element {}
class BarElem extends Element {}
`
      });
    });

    test('converts multiple elements with templates in a file', async () => {
      setSources({
        'test.html': `
<link rel="import" href="./polymer.html">
<dom-module id="foo-elem">
  <template>
    <div>foo-element body</div>
  </template>
</dom-module>
<script>
  customElements.define('foo-elem', class FooElem extends Polymer.Element {});
</script>
<dom-module id="bar-elem">
  <template>
    <div>bar body</div>
  </template>
  <script>
    customElements.define('bar-elem', class BarElem extends Polymer.Element {});
  </script>
</dom-module>
<div>Random footer</div>
`,
        'polymer.html': `
<script>
  Polymer.Element = class Element {};
</script>
`
      });
      assertSources(await convert(), {
        'test.js': `
import { Element } from './polymer.js';
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');
$_documentContainer.innerHTML = \`<div>Random footer</div>\`;
document.head.appendChild($_documentContainer);
customElements.define('foo-elem', class FooElem extends Element {
  static get template() {
    return Polymer.html\`
    <div>foo-element body</div>
\`;
  }
});
customElements.define('bar-elem', class BarElem extends Element {
  static get template() {
    return Polymer.html\`
    <div>bar body</div>
\`;
  }
});
`
      });
    });

    test('writes new imports as relative from the source file', async () => {
      setSources({
        'subdir/element.html': `
          <link rel="import" href="../lib.html">
        `,
        'subdir/index.html': `
          <link rel="import" href="../lib.html">
          <link rel="import" href="./element.html">
        `,
        'lib.html': `
          <script>
            Polymer.Element = class Element {};
          </script>
        `
      });
      assertSources(await convert(), {
        'subdir/element.js': `
import '../lib.js';
`,

        'subdir/index.html': `

          <script type="module" src="../lib.js"></script>
          <script type="module" src="./element.js"></script>
        `
      });
    });

    test('converts scripts in preserved html properly', async () => {
      setSources({
        'index.html': `
          <div>This is some html.</div>
          <link rel="import" href="./polymer.html">
          <script>
            document.registerElement(
              'foo-elem', class FooElem extends Polymer.Element {});
          </script>
          <script type="module">
            // this should not be changed because it is a module already
            document.registerElement(
              'bar-elem', class BarElem extends HTMLElement {});
          </script>
          <script>
            document.registerElement(
              'baz-elem', class BazElem extends Polymer.Element {});
          </script>
        `,
        'polymer.html': `
            <script>
              Polymer.Element = class Element {};
            </script>
        `
      });
      assertSources(await convert(), {
        'polymer.js': `
export const Element = class Element {};
`,

        'index.html': `

          <div>This is some html.</div>
          <script type="module" src="./polymer.js"></script>
          <script type="module">
import { Element } from './polymer.js';
document.registerElement(
  'foo-elem', class FooElem extends Element {});
</script>
          <script type="module">
            // this should not be changed because it is a module already
            document.registerElement(
              'bar-elem', class BarElem extends HTMLElement {});
          </script>
          <script type="module">
import { Element } from './polymer.js';
document.registerElement(
  'baz-elem', class BazElem extends Element {});
</script>
        `,
      });
    });

    test(`don't transform scripts that do not need it`, async () => {
      setSources({
        'index.html': `
          <div>This is some html.</div>
          <script>
            document.registerElement(
              'foo-elem', class FooElem extends HTMLElement {});
          </script>
        `
      });
      assertSources(await convert(), {
        'index.html': `

          <div>This is some html.</div>
          <script>
            document.registerElement(
              'foo-elem', class FooElem extends HTMLElement {});
          </script>
        `,
      });
    });

    test(`handles document.currentScript.ownerDocument`, async () => {
      setSources({
        'test.html': `
          <script>
            console.log(document.currentScript.ownerDocument);
            console.log(
              window.document.currentScript.ownerDocument.querySelectorAll(
                'div'));
            console.log(foo.document.currentScript.ownerDocument);
          </script>
        `
      });
      assertSources(await convert(), {
        'test.js': `
console.log(window.document);
console.log(
  window.document.querySelectorAll(
    'div'));
console.log(foo.document.currentScript.ownerDocument);
`
      });
    });

    testName = `handles imports that are modules but write to globals`;
    test(testName, async () => {
      setSources({
        'test.html': `
          <link rel="import" href="../shadycss/custom-style-interface.html">
          <link rel="import" href="../shadycss/apply-shim.html">
          <script>
            console.log(ShadyCSS.flush());
          </script>
        `,
        'index.html': `
          <link rel="import" href="../shadycss/custom-style-interface.html">
          <link rel="import" href="../shadycss/apply-shim.html">
          <script>
            console.log(ShadyCSS.flush());
          </script>
        `,
        'bower_components/shadycss/custom-style-interface.html': ``,
        'bower_components/shadycss/apply-shim.html': ``,
      });

      assertSources(await convert(), {
        'test.js': `
import '../@webcomponents/shadycss/entrypoints/custom-style-interface.js';
import '../@webcomponents/shadycss/entrypoints/apply-shim.js';
console.log(ShadyCSS.flush());
`,

        'index.html': `

          <script type="module" src="../@webcomponents/shadycss/entrypoints/custom-style-interface.js"></script>
          <script type="module" src="../@webcomponents/shadycss/entrypoints/apply-shim.js"></script>
          <script type="module">
import '../@webcomponents/shadycss/entrypoints/custom-style-interface.js';
import '../@webcomponents/shadycss/entrypoints/apply-shim.js';
console.log(ShadyCSS.flush());
</script>
        `
      });
    });

    testName = `handles inline scripts that write to global configuration ` +
        `properties`;
    test(testName, async () => {
      setSources({
        'index.html': `
          <script>
            window.ShadyDOM = {force: true};
          </script>
          <script>
            Polymer = {
              rootPath: 'earlyRootPath/'
            }
          </script>
          <link rel="import" href="../shadycss/custom-style-interface.html">
          <link rel="import" href="../shadycss/apply-shim.html">
          <script>
            console.log(ShadyDOM.flush());
          </script>
        `,
        'bower_components/shadycss/custom-style-interface.html': ``,
        'bower_components/shadycss/apply-shim.html': ``,
      });

      assertSources(await convert(), {
        'index.html': `

          <script>
            window.ShadyDOM = {force: true};
          </script>
          <script>
            Polymer = {
              rootPath: 'earlyRootPath/'
            }
          </script>
          <script type="module" src="../@webcomponents/shadycss/entrypoints/custom-style-interface.js"></script>
          <script type="module" src="../@webcomponents/shadycss/entrypoints/apply-shim.js"></script>
          <script type="module">
import '../@webcomponents/shadycss/entrypoints/custom-style-interface.js';
import '../@webcomponents/shadycss/entrypoints/apply-shim.js';
console.log(ShadyDOM.flush());
</script>
        `
      });
    });

    testName =
        `finds the right element declaration to associate the template with`;
    test(testName, async () => {
      setSources({
        'test.html': `
<dom-module id="foo"><template>foo</template></dom-module>
<script>
  Polymer({
    is: 'foo'
  });
</script>

<dom-module id="bar"><template>bar</template></dom-module>
<script>
  Polymer({
    is: 'bar'
  });
</script>
        `
      });
      assertSources(await convert(), {
        'test.js': `
Polymer({
  _template: Polymer.html\`
foo
\`,

  is: 'foo'
});
Polymer({
  _template: Polymer.html\`
bar
\`,

  is: 'bar'
});
`
      });
    });

    testName = `convert namespace assignments on maintained inline scripts`;
    test(testName, async () => {
      setSources({
        'index.html': `
          <link rel="import" href="./polymer.html">
          <script>
            Polymer.foo = class Foo {foo() {}};
            new Polymer.foo().foo();
          </script>
        `,
        'polymer.html': `
          <script>
            /** @namespace */
            const Polymer = {};
          </script>
        `
      });

      assertSources(await convert(), {
        'index.html': `

          <script type="module" src="./polymer.js"></script>
          <script type="module">
import './polymer.js';
export const foo = class Foo {foo() {}};
new foo().foo();
</script>
        `,
        'polymer.js': `

`
      });
    });

    test(`convert writes into setter calls`, async () => {
      setSources({
        'test.html': `
          <link rel="import" href="./settings.html">

          <script>
            Polymer.foo = 'hello';
            window.Polymer.bar.baz = Polymer.foo + 10 * 10 ** 10;
          </script>
        `,
        'settings.html': `
          <script>
            Polymer.foo = 'default';
            Polymer.setFoo = function(newFoo) {
              Polymer.foo = newFoo;
            }

            /** @namespace */
            Polymer.bar = {
              baz: 100,
              setBaz: function(newBaz) {
                this.baz = newBaz;
              }
            };
          </script>
        `
      });

      // Note(rictic): we don't yet get that `baz` can't be `const` here.
      assertSources(await convert(), {
        'settings.js': `
export let foo = 'default';

export const setFoo = function(newFoo) {
  foo = newFoo;
};

export const baz = 100;

export function setBaz(newBaz) {
  baz = newBaz;
}
`,

        'test.js': `
import { setFoo, setBaz, foo } from './settings.js';
setFoo('hello');
setBaz(foo + 10 * (10 ** 10));
`,
      });
    });

    testName = `we convert urls of external scripts in html to html transforms`;
    test(testName, async () => {
      setSources({
        'index.html': `
          <script src="../foo/foo.js"></script>
        `,
        'bower_components/foo/foo.js': `
          console.log('hello world');
        `
      });
      let expectedWarnings = [`WARN: bower->npm mapping for "foo" not found`];
      assertSources(await convert({packageName: 'polymer', expectedWarnings}), {
        'index.html': `

          <script src="../foo/foo.js"></script>
        `,
      });
      // Warnings are memoized, duplicates are not expected
      expectedWarnings = [];
      assertSources(
          await convert({packageName: '@polymer/polymer', expectedWarnings}), {
            'index.html': `

          <script src="../../foo/foo.js"></script>
        `,
          });
    });

    test(`remove WebComponentsReady`, async () => {
      setSources({
        'test.html': `
          <script>
            addEventListener('WebComponentsReady', () => {
              class XFoo extends HTMLElement {
                connectedCallback() {
                  this.spy = sinon.spy(window.ShadyCSS, 'styleElement');
                  super.connectedCallback();
                  this.spy.restore();
                }
              }
              customElements.define('x-foo', XFoo);

            });

            HTMLImports.whenReady(function() {
              Polymer({
                is: 'data-popup'
              });
            });
          </script>
        `,
      });

      assertSources(await convert({packageName: 'polymer'}), {
        'test.js': `
class XFoo extends HTMLElement {
  connectedCallback() {
    this.spy = sinon.spy(window.ShadyCSS, 'styleElement');
    super.connectedCallback();
    this.spy.restore();
  }
}
customElements.define('x-foo', XFoo);

Polymer({
  is: 'data-popup'
});
`,
      });
    });

    test(`clones unclaimed dom-modules, leaves out scripts`, async () => {
      setSources({
        'test.html': `
          <dom-module>
            <template>
              Scripts in here are cloned
              <script>foo</script>
            </template>
            <script>// this is not cloned</script>
          </dom-module>
        `,
      });

      assertSources(await convert({packageName: 'polymer'}), {
        'test.js': `
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');

$_documentContainer.innerHTML = \`<dom-module>
            <template>
              Scripts in here are cloned
              <script>foo&lt;/script>
            </template>
` +
            '            ' +
            `
          </dom-module>\`;

document.head.appendChild($_documentContainer);
`,
      });
    });

    testName =
        'Import aliases do not conflict with local identifiers or other imports.';
    test(testName, async () => {
      setSources({
        'NS1-foo.html': `
            <script>
              NS1.foo = "NS1.foo";
            </script>
          `,
        'NS2-foo.html': `
            <script>
              NS2.foo = "NS2.foo";
            </script>
          `,
        'NS3-foo.html': `
            <script>
              NS3.foo = "NS3.foo";
            </script>
          `,
        'test.html': `
            <link rel="import" href="./NS1-foo.html">
            <link rel="import" href="./NS2-foo.html">
            <link rel="import" href="./NS3-foo.html">
            <script>
              var foo = "foo";
              var foo$1 = "foo$1";
              var foo$2 = "foo$2";
              // Log local variables.
              console.log(foo);
              console.log(foo$1);
              console.log(foo$2);
              // Log imports.
              console.log(NS1.foo);
              console.log(NS2.foo);
              console.log(NS3.foo);
            </script>
          `,
      });
      assertSources(await convert({namespaces: ['NS1', 'NS2', 'NS3']}), {
        'test.js': `
import { foo as foo$0 } from './NS1-foo.js';
import { foo as foo$3 } from './NS2-foo.js';
import { foo as foo$4 } from './NS3-foo.js';
var foo = "foo";
var foo$1 = "foo$1";
var foo$2 = "foo$2";
// Log local variables.
console.log(foo);
console.log(foo$1);
console.log(foo$2);
// Log imports.
console.log(foo$0);
console.log(foo$3);
console.log(foo$4);
`
      });
    });

    test('styles are not converted to imperative code by default', async () => {
      setSources({
        'index.html': `
          <style>
            body { color: red; }
          </style>
          <custom-style>
            <style is="custom-style">
              body { background-color: var(--happy, yellow); }
            </style>
          </custom-style>
        `
      });
      assertSources(await convert(), {
        'index.html': `

          <style>
            body { color: red; }
          </style>
          <custom-style>
            <style is="custom-style">
              body { background-color: var(--happy, yellow); }
            </style>
          </custom-style>
        `
      });
    });
    testName = 'when there is a style import, ' +
        'all inline styles and body elements are converted to imperative scripts';
    test(testName, async () => {
      setSources({
        'index.html': `
          <style>
            body { color: red; }
          </style>
          <style is="custom-style" include="foo-bar">
            body { font-size: 10px; }
          </style>
          <custom-style>
            <style is="custom-style">
              body { background-color: var(--happy, yellow); }
            </style>
          </custom-style>
          <foo-elem></foo-elem>
        `
      });
      assertSources(await convert(), {
        'index.html': `

          <!-- FIXME(polymer-modulizer):
        These imperative modules that innerHTML your HTML are
        a hacky way to be sure that any mixins in included style
        modules are ready before any elements that reference them are
        instantiated, otherwise the CSS @apply mixin polyfill won't be
        able to expand the underlying CSS custom properties.
        See: https://github.com/Polymer/polymer-modulizer/issues/154
        -->
    <script type="module">
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');

$_documentContainer.innerHTML = \`<style>
            body { color: red; }
          </style>\`;

document.head.appendChild($_documentContainer);
</script>
          <script type="module">
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');

$_documentContainer.innerHTML = \`<style is="custom-style" include="foo-bar">
            body { font-size: 10px; }
          </style>\`;

document.head.appendChild($_documentContainer);
</script>
          <script type="module">
const $_documentContainer = document.createElement('div');

$_documentContainer.innerHTML = \`<custom-style>
            <style is="custom-style">
              body { background-color: var(--happy, yellow); }
            </style>
          </custom-style>\`;

document.body.appendChild($_documentContainer);
</script>
          <script type="module">
const $_documentContainer = document.createElement('div');
$_documentContainer.innerHTML = \`<foo-elem></foo-elem>\`;
document.body.appendChild($_documentContainer);
</script>
        `
      });
    });

    test('accessing properties on exports is supported', async () => {
      setSources({
        'test.html': `
<script>

  (function() {

    function IronMeta() {}

    Polymer.IronMeta = IronMeta;

    var metaDatas = Polymer.IronMeta.types;
  })();
</script>
`
      });

      assertSources(await convert(), {
        'test.js': `
function IronMeta() {}

export { IronMeta };

var metaDatas = IronMeta.types;
`
      });
    });

    test('Internal imported scripts get inlined into a module', async () => {
      setSources({
        'test.html': `
          <script src='foo.js'></script>
        `,
        'foo.js': 'console.log("foo");'
      });

      assertSources(await convert(), {
        'test.js': `
console.log("foo");
`
      });
    });


    test(
        'External imported scripts do not get inlined into a module',
        async () => {
          setSources({
            'test.html': `
          <script src='../dep/dep.js'></script>
        `,
            'bower_components/dep/dep.js': 'console.log("foo");'
          });

          assertSources(await convert(), {
            'test.js': `
import '../dep/dep.js';
`
          });
        });

    testName = `don't treat all values on a namespace as namespaces themselves`;
    test(testName, async () => {
      setSources({
        'test.html': `
          <script>
            Polymer.IronSelection = function() {};
            Polymer.IronSelection.prototype = {};
          </script>
`
      });

      assertSources(await convert(), {
        'test.js': `
export const IronSelection = function() {};
IronSelection.prototype = {};
`
      });
    });

    testName = `deal with initializing a namespace by self-assignment`;
    test(testName, async () => {
      setSources({
        'test.html': `
          <script>
            /** @namespace */
            var NS1 = NS1 || {};
            /** @namespace */
            window.NS2 = window.NS2 || {};
            /** @namespace */
            NS2.SubNS = window.NS2.SubNS || {};

            NS2.SubNS.foo = 10;
          </script>
`
      });

      assertSources(await convert(), {
        'test.js': `
export const foo = 10;
`
      });
    });

    testName = `deal with cyclic dependency graphs`;
    test(testName, async () => {
      setSources({
        'a.html': `
          <link rel="import" href="./b.html">
          <script>
            Polymer.foo = 5;
          </script>
        `,
        'b.html': `
          <link rel="import" href="./a.html">
          <script>
            Polymer.bar = 20;
          </script>
        `,
      });
      const expectedWarnings =
          ['Cycle in dependency graph found where b.html imports a.html.\n' +
           '    Modulizer does not yet support rewriting references among ' +
           'cyclic dependencies.'];
      assertSources(await convert({expectedWarnings}), {
        'a.js': `
import './b.js';
export const foo = 5;
`,
        'b.js': `
import './a.js';
export const bar = 20;
`
      });
    });

    testName = `Deal with cyclic references`;
    test(testName, async () => {
      setSources({
        'a.html': `
          <link rel="import" href="./b.html">
          <script>
            Polymer.foo = function() {
              return Polymer.bar || 10;
            }
          </script>
        `,
        'b.html': `
          <link rel="import" href="./a.html">
          <script>
            Polymer.bar = (function() {
              if (Polymer.foo) {
                return 50;
              }
              return 5;
            })();
          </script>
      `
      });

      const expectedWarnings =
          ['Cycle in dependency graph found where b.html imports a.html.\n' +
           '    Modulizer does not yet support rewriting references among ' +
           'cyclic dependencies.'];
      assertSources(await convert({expectedWarnings}), {
        'a.js': `
import { bar } from './b.js';

export const foo = function() {
  return bar || 10;
};
`,
        // TODO(rictic): we should rewrite Polymer.foo here, but that's tricky…
        'b.js': `
import './a.js';

export const bar = (function() {
  if (Polymer.foo) {
    return 50;
  }
  return 5;
})();
`,
      });
    });

    testName = `don't inline nonstandard dom-modules`;
    test(testName, async () => {
      setSources({
        'test.html': `
          <dom-module id="dom-module-attr" attr></dom-module>
          <dom-module id="just-fine">
            <template>Hello world</template>
          </dom-module>
          <dom-module id="multiple-templates">
            <template></template>
            <template></template>
          </dom-module>
          <script>
            customElements.define(
                'dom-module-attr', class extends HTMLElement{});
            customElements.define(
                'just-fine', class extends HTMLElement{});
            customElements.define(
                'multiple-templates', class extends HTMLElement{});
          </script>
        `
      });
      assertSources(await convert(), {
        'test.js': `
const $_documentContainer = document.createElement('div');
$_documentContainer.setAttribute('style', 'display: none;');

$_documentContainer.innerHTML = \`<dom-module id="dom-module-attr" attr=""></dom-module><dom-module id="multiple-templates">
            <template></template>
            <template></template>
          </dom-module>\`;

document.head.appendChild($_documentContainer);
customElements.define(
    'dom-module-attr', class extends HTMLElement{});
customElements.define(
    'just-fine', class extends HTMLElement{
  static get template() {
    return Polymer.html\`
Hello world
\`;
  }
});
customElements.define(
    'multiple-templates', class extends HTMLElement{});
`,
      });
    });

    testName = `rewrite toplevel 'this' to 'window'`;
    test(testName, async () => {
      setSources({
        'test.html': `
          <script>
            console.log(this);
            function foo() {
              console.log(this);
            }
            class Foo {
              constructor() {
                this.bar = 10;
              }
            }
            if (this) {
              this;
            }
          </script>
          <script>
            'use strict';
            console.log(this);
          </script>
        `
      });

      assertSources(await convert(), {
        'test.js': `
console.log(window);
function foo() {
  console.log(this);
}
class Foo {
  constructor() {
    this.bar = 10;
  }
}
if (window) {
  window;
}
'use strict';
console.log(this);
`,
      });
    });

    testName = `convert scripts inside demo snippet scripts`;
    test(testName, async () => {
      setSources({
        'index.html': `
          <link rel="import" href="./polymer.html">
          <demo-snippet>
            <template>
              <script>
                console.log(Polymer.foo);
              </script>
            </template>
          </demo-snippet>
        `,
        'polymer.html': `
          <script>
            /** @namespace */
            const Polymer = {};
            Polymer.foo = 10;
          </script>
        `
      });

      assertSources(await convert(), {
        'index.html': `

          <script type="module" src="./polymer.js"></script>
          <demo-snippet>
            <template>
              <script type="module">
import { foo } from './polymer.js';
console.log(foo);
</script>
            </template>
          </demo-snippet>
        `,
      });
    });

    testName = `Unwrap multiple IIFEs`;
    test(testName, async () => {
      setSources({
        'test.html': `
          <script>
            (function() {
              console.log('one');
            })();
            (function() {
              console.log('two');
            })();
          </script>
        `
      });

      assertSources(await convert(), {
        'test.js': `
console.log('one');
console.log('two');
`,
      });
    });

    testName = 'copy over comments in a page with scripts';
    test(testName, async () => {
      setSources({
        'test.html': `
          <!-- First comment -->
          <script></script>
          <!-- Second comment -->
          <script>
            // comment in script
            console.log('second script');
          </script>
          <!-- Another comment -->
          <!-- Final trailing comment -->
        `
      });

      assertSources(await convert(), {
        'test.js': `
/* First comment */
;

// comment in script
/* Second comment */
console.log('second script');

/* Another comment */
/* Final trailing comment */
;
`,
      });
    });

    testName = 'copy over comments in a page without scripts';
    test(testName, async () => {
      setSources({
        'test.html': `
          <!-- First comment -->
          <!-- Second comment -->
          <!-- Final trailing comment -->
        `
      });

      assertSources(await convert(), {
        'test.js': `
/* First comment */
/* Second comment */
/* Final trailing comment */
;
`,
      });
    });


    testName = 'copy and escape comments that include JS comment tags';
    test(testName, async () => {
      setSources({
        'test.html': `
<!-- /* First comment */ -->

<script>
  // comment in script
  console.log('second script');
</script>

<!--
  /**
   *  Final comment
   **/
-->`
      });

      assertSources(await convert(), {
        'test.js': `
// comment in script
/* /* First comment *\\/ */
console.log('second script');

/*
  /**
   *  Final comment
   **\\/
*/
;
`,
      });
    });


    testName = 'copy over license comments properly';
    test(testName, async () => {
      setSources({
        'test.html': `
          <!-- @license This is a license -->
          <!-- Second comment -->
          <!-- Final trailing comment -->
        `
      });

      assertSources(await convert(), {
        'test.js': `
/** @license This is a license */
/* Second comment */
/* Final trailing comment */
;
`,
      });
    });

    suite('regression tests', () => {
      testName = `propagate templates for scripts consisting ` +
          `only of an element definition`;
      test(testName, async () => {
        setSources({
          'test.html': `
        <dom-module id='url-bar'>
          <template>
            <div>Implementation here</div>
          </template>
          <script>
            Polymer({
              is: 'url-bar',
            })
          </script>
        </dom-module>
        `
        });

        assertSources(await convert(), {
          'test.js': `
Polymer({
  _template: Polymer.html\`
            <div>Implementation here</div>
\`,

  is: 'url-bar'
})
`,
        });
      });
    });

  });

  suite('getMemberPath', () => {

    function getMemberExpression(source: string) {
      const program = esprima.parse(source);
      const statement = program.body[0] as estree.ExpressionStatement;
      const expression = statement.expression as estree.AssignmentExpression;
      return expression.left as estree.MemberExpression;
    }

    test('works for a single property access', () => {
      const memberExpression = getMemberExpression(`Foo.Bar = 'A';`);
      const memberPath = getMemberPath(memberExpression);
      assert.deepEqual(memberPath, ['Foo', 'Bar']);
    });

    test('works for chained property access', () => {
      const memberExpression = getMemberExpression(`Foo.Bar.Baz = 'A';`);
      const memberPath = getMemberPath(memberExpression);
      assert.deepEqual(memberPath, ['Foo', 'Bar', 'Baz']);
    });

    test('discards leading `window`', () => {
      const memberExpression = getMemberExpression(`window.Foo.Bar.Baz = 'A';`);
      const memberPath = getMemberPath(memberExpression);
      assert.deepEqual(memberPath, ['Foo', 'Bar', 'Baz']);
    });

  });

});
