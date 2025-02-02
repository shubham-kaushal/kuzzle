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

'use strict';

const { NativeController } = require('./baseController');

/**
 * @class RealtimeController
 */
class RealtimeController extends NativeController {
  constructor () {
    super([
      'count',
      'join',
      'list',
      'publish',
      'subscribe',
      'unsubscribe',
      'validate'
    ]);
  }

  /**
   * @param {Request} request
   * @returns {Promise<Object>}
   */
  async subscribe (request) {
    // assertion checks
    request.getIndexAndCollection();
    request.getBody();

    // Only funnel protocol (and thus the embedded SDK) can use "propagate"
    // option
    if ( request.context.connection.protocol !== 'funnel'
      || request.input.args.propagate === undefined
      || request.input.args.propagate === null
    ) {
      request.input.args.propagate = true;
    }
    else {
      request.input.args.propagate = request.getBoolean('propagate');
    }

    const result = await global.kuzzle.ask('core:realtime:subscribe', request);

    if (! result) {
      // can occur if the connection is dead.
      // If so, we don't really have to care about the response
      return null;
    }

    return result;
  }

  /**
   * @param {Request} request
   * @returns {Promise<Object>}
   */
  async join (request) {
    // assertion checks
    request.getBodyString('roomId');

    return global.kuzzle.ask('core:realtime:join', request);
  }

  /**
   * @param {Request} request
   * @returns {Promise<String>}
   */
  async unsubscribe (request) {
    const roomId = request.getBodyString('roomId');

    await global.kuzzle.ask(
      'core:realtime:unsubscribe',
      request.context.connection.id,
      roomId);

    return { roomId };
  }

  /**
   * @param {Request} request
   * @returns {Promise<Object>}
   */
  async count (request) {
    const roomId = request.getBodyString('roomId');

    return {
      count: await global.kuzzle.ask('cluster:realtime:room:count', roomId),
    };
  }

  /**
   * @param {Request} request
   * @returns {Promise.<Object>}
   */
  list (request) {
    return global.kuzzle.ask('core:realtime:list', request.context.user);
  }

  /**
   * Publish a realtime message
   *
   * @param {Request} request
   * @returns {Promise<Object>}
   */
  async publish (request) {
    // assertion checks
    request.getBody();
    request.getIndexAndCollection();

    const newRequest = await global.kuzzle.validation.validate(request, false);

    newRequest.input.body._kuzzle_info = {
      author: request.getKuid(),
      createdAt: Date.now()
    };

    await global.kuzzle.ask('core:realtime:publish', newRequest);

    return { published: true };
  }

  /**
   * Validate a document against collection validation specifications.
   *
   * @param {Request} request
   * @returns {Promise<Object>}
   */
  validate (request) {
    return global.kuzzle.funnel.controllers.get('document').validate(request);
  }
}

module.exports = RealtimeController;
