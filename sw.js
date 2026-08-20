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
    "revision": "9bba766fd41d5c082bd07d7d49ddd7b5"
  }, {
    "url": "icon-512-inncempro.png",
    "revision": "9bba766fd41d5c082bd07d7d49ddd7b5"
  }, {
    "url": "icon-192-inncempro.png",
    "revision": "5e26ee779592e3bb72cad59a61e6006f"
  }, {
    "url": "icon-1024.png",
    "revision": "2c878a89ad3d748727e29b4beca73b54"
  }, {
    "url": "favicon-inncempro.ico",
    "revision": "163fdf8545e9401aa16970ff2a9a3f56"
  }, {
    "url": "favicon-32-inncempro.png",
    "revision": "a7fdc531e487407355dc1dc061a5a638"
  }, {
    "url": "favicon-16-inncempro.png",
    "revision": "624a71ec43528a3d9f3666ac27226966"
  }, {
    "url": "apple-touch-icon-final.png",
    "revision": "7e8670a67ad20029239da8b90a42cea6"
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
