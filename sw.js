/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-5d155c7a'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "123fed109c95b6539df97f9415adb80e"
  }, {
    "url": "manifest.webmanifest",
    "revision": "83497b5c5faf76e16840287b2ee06580"
  }, {
    "url": "logo-header.png",
    "revision": "77de9ae56cb5dff9abab29d14ba3cc49"
  }, {
    "url": "index.html",
    "revision": "1d363eafde742f1d5bd144dca7e28442"
  }, {
    "url": "icon-maskable-512.png",
    "revision": "aafb99953f9a01fa18ee7d4cfc99a645"
  }, {
    "url": "icon-512-inncempro.png",
    "revision": "f4156f172877047e437c4170cc6d0513"
  }, {
    "url": "icon-192-inncempro.png",
    "revision": "0b67efb85a7f33a01917991cca3762e4"
  }, {
    "url": "icon-1024.png",
    "revision": "019295de80d1aa0420c52e27b9225675"
  }, {
    "url": "favicon-inncempro.ico",
    "revision": "49ebfd5b59d0338d1522e0c9af07ca84"
  }, {
    "url": "favicon-32-inncempro.png",
    "revision": "e93e36826420e35dc1edd9025bfb28a3"
  }, {
    "url": "favicon-16-inncempro.png",
    "revision": "9f253446ead9c03e216fa8c0ce35898d"
  }, {
    "url": "apple-touch-icon-final.png",
    "revision": "70ab32e84b5d418848b39366c03a7401"
  }, {
    "url": "assets/index-yxMATJiC.js",
    "revision": null
  }, {
    "url": "assets/index-DO6yLyEl.css",
    "revision": null
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/mt1\.google\.com\/vt\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-maps-tiles",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 4000,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/wegygdxneeddzfuaixtk\.supabase\.co\/rest\/.*/i, new workbox.NetworkFirst({
    "cacheName": "supabase-data",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 200,
      maxAgeSeconds: 604800
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/nominatim\.openstreetmap\.org\/.*/i, new workbox.NetworkFirst({
    "cacheName": "nominatim",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 3000,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
