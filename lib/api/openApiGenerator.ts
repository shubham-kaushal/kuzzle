/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2020 Kuzzle
 * mailto: support AT kuzzle.io
 * website: http://kuzzle.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import _ from 'lodash';
import { KuzzleRequest } from './request';
import { version } from './../../package.json';
import {
  DefinitionsDocument, 
  DocumentCountComponent, 
} from './openapi/documents/document';
import { Inflector } from './../util/inflector';

const routeUrlMatch = /:([^/]*)/g;

/**
 * Generates JSON OpenApi object
 *
 * @returns {object} openApi object
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export function generateOpenApi(_request: KuzzleRequest): any {
/* eslint-enable @typescript-eslint/no-unused-vars */
  const routes = [];

  global.kuzzle.config.http.routes.forEach(_route => routes.push({ ..._route }));
  global.kuzzle.pluginsManager.routes.forEach(_route => routes.push({ ..._route }));

  /* eslint-disable sort-keys */
  const response = {
    openapi: '3.0.1',
    info: {
      title: 'Kuzzle API',
      description: 'The Kuzzle HTTP API',
      contact: {
        name: 'Kuzzle team',
        url: 'http://kuzzle.io',
        email: 'hello@kuzzle.io'
      },
      license: {
        name: 'Apache 2',
        url: 'http://opensource.org/licenses/apache2.0'
      },
      version: version
    },
    externalDocs: {
      description: 'Kuzzle API Documentation',
      url: 'https://docs.kuzzle.io/core/2/api/'
    },
    servers: [
      {
        url: 'https://{baseUrl}:{port}',
        description: 'Kuzzle Base Url',
        variables: {
          baseUrl: {
            default: 'localhost'
          },
          port: {
            default: '7512'
          }
        }

      }
    ],
    tags: [
      {
        name: 'document',
        description: 'document controller'
      }
    ],
    schemes: [
      "https",
      "http"
    ],
    paths: {},
    components: {
      ...DefinitionsDocument,
      schemas: {
        ...DocumentCountComponent,
      }
    }
  };
  /* eslint-enable sort-keys */

  for (const route of routes) {
    // Make sure route verbs are lowercase
    if (route.verb !== undefined) {
      route.verb = route.verb.toLowerCase();
    }

    // Set :param notation to {param}
    route.formattedPath = route.path.replace(routeUrlMatch, '{$1}');

    if (response.paths[route.formattedPath] === undefined) {
      response.paths[route.formattedPath] = {};
    }

    if (response.paths[route.formattedPath][route.verb] !== undefined) {
      return;
    }

    // If custom specification, return as it is
    // decomments when the swagger file is corrected
    // if (route.openapi) {
    //   response.paths[route.formattedPath][route.verb] = route.openapi;
    //   return;
    // }

    if (route.openapi === undefined) {
      route.openapi = {};
    }
    if (route.controller !== undefined) {
      if (!_.some(response.tags, {name: route.controller})) {
        const capitalizedController = Inflector.upFirst(route.controller);
        response.tags.push({description: `${capitalizedController} Controller`, name: route.controller});
      }
      if (route.openapi.tags === undefined) {
        route.openapi.tags = [];
      }
      if (!route.openapi.tags.includes(route.controller)) {
        route.openapi.tags.push(route.controller);
      }
    }

    if (route.openapi.description === undefined) {
      route.openapi.description = `Controller: ${route.controller}.`;
    }
    if (route.openapi.summary === undefined) {
      route.openapi.summary = `Action: ${route.action}.`;
    }
    if (route.openapi.parameters === undefined) {
      route.openapi.parameters = [];

      let m = routeUrlMatch.exec(route.path);
      while (m !== null) {
        routeUrlMatch.lastIndex++;
        route.openapi.parameters.push({
          in: 'path',
          name: m[1],
          required: true,
          schema: {type: 'string'}
        });

        m = routeUrlMatch.exec(route.path);
      }
    }

    if (route.openapi.parameters.length === 0) {
      route.openapi.parameters = undefined;
    }

    if (route.openapi.responses === undefined) {
      route.openapi.responses = {
        '200': {
          description: 'OK'
        }
      };
    }

    response.paths[route.formattedPath][route.verb] = route.openapi;
  }

  return response;
}