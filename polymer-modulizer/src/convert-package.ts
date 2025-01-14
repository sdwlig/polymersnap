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

import * as path from 'path';
import {Analysis, Analyzer, FSUrlLoader, InMemoryOverlayUrlLoader, PackageUrlResolver} from 'polymer-analyzer';

import {ConversionSettings, createDefaultConversionSettings, PartialConversionSettings} from './conversion-settings';
import {generatePackageJson, readJson, writeJson} from './manifest-converter';
import {ProjectConverter} from './project-converter';
import {polymerFileOverrides} from './special-casing';
import {PackageUrlHandler} from './urls/package-url-handler';
import {PackageType} from './urls/types';
import {getDocumentUrl} from './urls/util';
import {mkdirp, rimraf, writeFileResults} from './util';


/**
 * Configuration options required for package-layout conversions. Contains
 * information about the package under conversion, including what files to
 * convert, its new package name, and its new npm version number.
 */
export interface PackageConversionSettings extends PartialConversionSettings {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly packageType?: PackageType;
  readonly inDir: string;
  readonly outDir: string;
  readonly cleanOutDir?: boolean;
}

/**
 * Create and/or clean the "out" directory, setting it up for conversion.
 */
async function setupOutDir(outDir: string, clean = false) {
  if (clean) {
    await rimraf(outDir);
  }
  try {
    await mkdirp(outDir);
  } catch (e) {
    if (e.errno === -17) {
      // directory exists, do nothing
    } else {
      throw e;
    }
  }
}

/**
 * Create the default conversion settings, adding any "main" files from the
 * current package's bower.json maifest to the "includes" set.
 */
function getConversionSettings(
    analysis: Analysis, options: PackageConversionSettings, bowerJson: any) {
  const conversionSettings = createDefaultConversionSettings(analysis, options);
  let bowerMainFiles = (bowerJson.main) || [];
  if (!Array.isArray(bowerMainFiles)) {
    bowerMainFiles = [bowerMainFiles];
  }
  for (const filename of bowerMainFiles) {
    conversionSettings.includes.add(filename);
  }
  return conversionSettings;
}

/**
 * Get the relevant documents from a package, to be converted.
 */
export function getPackageDocuments(
    analysis: Analysis, conversionSettings: ConversionSettings) {
  const htmlDocuments = [...analysis.getFeatures({kind: 'html-document'})];
  return htmlDocuments.filter(
      (d) => PackageUrlHandler.isUrlInternalToPackage(getDocumentUrl(d)) &&
          !conversionSettings.excludes.has(d.url));
}

/**
 * Configure a basic analyzer instance for the package under conversion.
 */
function configureAnalyzer(options: PackageConversionSettings) {
  const urlLoader =
      new InMemoryOverlayUrlLoader(new FSUrlLoader(options.inDir));
  for (const [url, contents] of polymerFileOverrides) {
    urlLoader.urlContentsMap.set(url, contents);
    urlLoader.urlContentsMap.set(`bower_components/polymer/${url}`, contents);
  }
  return new Analyzer({
    urlLoader,
    urlResolver: new PackageUrlResolver(),
  });
}

/**
 * Convert a package-layout project to JavaScript modules & npm.
 */
export default async function convert(options: PackageConversionSettings) {
  const outDir = options.outDir;
  const npmPackageName = options.packageName;
  const npmPackageVersion = options.packageVersion;
  await setupOutDir(outDir, options.cleanOutDir);

  // Configure the analyzer and run an analysis of the package.
  const bowerJson = readJson(options.inDir, 'bower.json');
  const analyzer = configureAnalyzer(options);
  const analysis = await analyzer.analyzePackage();
  await setupOutDir(options.outDir, !!options.cleanOutDir);

  // Create the url handler & converter.
  const urlHandler =
      new PackageUrlHandler(options.packageName, options.packageType);
  const conversionSettings =
      getConversionSettings(analysis, options, bowerJson);
  const converter = new ProjectConverter(urlHandler, conversionSettings);

  // Gather all relevent package documents, and run the converter on them!
  for (const document of getPackageDocuments(analysis, conversionSettings)) {
    converter.convertDocument(document);
  }

  // Filter out external results before writing them to disk.
  const results = converter.getResults();
  for (const [newPath] of results) {
    if (!PackageUrlHandler.isUrlInternalToPackage(newPath)) {
      results.delete(newPath);
    }
  }
  await writeFileResults(outDir, results);

  // Delete files that were explicitly requested to be deleted.
  for (const glob of options.deleteFiles || []) {
    await rimraf(path.join(outDir, glob));
  }

  // Generate a new package.json, and write it to disk.
  try {
    const packageJson =
        generatePackageJson(bowerJson, npmPackageName, npmPackageVersion);
    writeJson(packageJson, outDir, 'package.json');
  } catch (err) {
    console.log(
        `error in bower.json -> package.json conversion (${err.message})`);
  }
}
