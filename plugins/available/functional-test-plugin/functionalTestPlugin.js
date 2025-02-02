'use strict';

const should = require('should/as-function');
const _ = require('lodash');

class FunctionalTestPlugin {
  constructor () {
    this.version = require('./package.json').version;

    this.controllers = {};
    this.routes = [];
    this.pipes = {};
    this.hooks = {};

    // context.constructor.ESClient related declarations =======================

    this.controllers.constructors = { ESClient: 'testConstructorsESClient' };

    this.routes.push({
      action: 'ESClient',
      controller: 'constructors',
      url: '/constructors/esclient/:index',
      verb: 'post',
    });

    // Custom Realtime subscription related declarations =======================

    this.controllers.accessors = {
      registerSubscription: 'registerSubscription',
      unregisterSubscription: 'unregisterSubscription',
    };

    this.routes.push({
      action: 'registerSubscription',
      controller: 'accessors',
      url: '/accessors/registerSubscription',
      verb: 'POST',
    });
    this.routes.push({
      action: 'unregisterSubscription',
      controller: 'accessors',
      url: '/accessors/unregisterSubscription',
      verb: 'POST',
    });

    // context.secrets related declarations ====================================

    this.controllers.secrets = { test: 'testSecrets' };

    this.routes.push({
      action: 'test',
      controller: 'secrets',
      url: '/secrets',
      verb: 'post',
    });

    // pipes related declarations ==============================================

    this.controllers.pipes = {
      deactivateAll: 'pipesDeactivateAll',
      manage: 'pipesManage',
      testReturn: 'pipesTestReturn'
    };

    this.routes.push({
      action: 'manage',
      controller: 'pipes',
      path: '/pipes/:event/:state',
      verb: 'post',
    });
    this.routes.push({
      action: 'deactivateAll',
      controller: 'pipes',
      path: '/pipes',
      verb: 'delete',
    });
    this.routes.push({
      action: 'testReturn',
      controller: 'pipes',
      // keep a route definition with "url" even if it's deprecated
      url: '/pipes/test-return/:name',
      verb: 'post',
    });

    this.pipes['generic:document:beforeWrite'] =
      (...args) => this.genericDocumentEvent('beforeWrite', ...args);
    this.pipes['generic:document:afterWrite'] =
      (...args) => this.genericDocumentEvent('afterWrite', ...args);
    this.pipes['generic:document:beforeUpdate'] =
      (...args) => this.genericDocumentEvent('beforeUpdate', ...args);
    this.pipes['generic:document:afterUpdate'] =
      (...args) => this.genericDocumentEvent('afterUpdate', ...args);
    this.pipes['generic:document:beforeGet'] =
      (...args) => this.genericDocumentEvent('beforeGet', ...args);
    this.pipes['generic:document:afterGet'] =
      (...args) => this.genericDocumentEvent('afterGet', ...args);
    this.pipes['generic:document:beforeDelete'] =
      (...args) => this.genericDocumentEvent('beforeDelete', ...args);
    this.pipes['generic:document:afterDelete'] =
      (...args) => this.genericDocumentEvent('afterDelete', ...args);

    this.pipes['plugin-functional-test-plugin:testPipesReturn'] =
      async name => `Hello, ${name}`;

    // Pipe declared with a function name ======================================
    this.pipes['server:afterNow'] = this.afterNowPipe;

    // Embedded SDK realtime ===================================================
    this.controllers.realtime = {
      subscribeOnce: 'subscribeOnce',
    };

    this.routes.push({
      action: 'subscribeOnce',
      controller: 'realtime',
      path: '/realtime/subscribeOnce',
      verb: 'post',
    });


    // Embedded SDK.as() Impersonation =========================================
    this.controllers.impersonate = {
      createDocumentAs: 'createDocumentAs',
      testAction: 'testImpersonatedAction'
    };

    this.routes.push({
      action: 'createDocumentAs',
      controller: 'impersonate',
      path: '/impersonate/createDocumentAs/:kuid',
      verb: 'post',
    });

    this.routes.push({
      action: 'testAction',
      controller: 'impersonate',
      path: '/impersonate/testAction/:kuid',
      verb: 'post',
    });

    // hooks related declarations ==============================================
    this.hooks['server:afterNow'] = async () => {
      await this.context.accessors.sdk.realtime.publish(
        'functional-test',
        'hooks',
        { event: 'server:afterNow' });
    };
  }

  async init (config, context) {
    this.config = config;
    this.context = context;
    this.sdk = context.accessors.sdk;

    // Plugins must be able to perform API requests during their init phase.
    // There is no test associated: this line by itself will make functional
    // tests throw before they can even start if this premise is violated.
    await this.sdk.server.info();
  }

  // accessors.registerSubscription related methods ============================

  async registerSubscription (request) {
    const result = await this.context.accessors.subscription.register(
      request.context.connection.id,
      'nyc-open-data',
      'yellow-taxi',
      {
        equals: {
          name: 'Luca'
        }
      },
    );

    return {
      acknowledged: 'OK',
      connectionId: request.context.connection.id,
      roomId: result.roomId
    };
  }

  async unregisterSubscription (request) {
    const connectionId = request.input.body.connectionId ||
            request.context.connection.id,
      roomId = request.input.body.roomId;

    await this.context.accessors.subscription.unregister(connectionId, roomId, false);

    return {
      acknowledged: 'OK'
    };
  }

  // context.constructor.ESClient related methods ==============================

  async testConstructorsESClient (request) {
    const
      client = new this.context.constructors.ESClient(),
      esRequest = {
        body: request.input.body,
        id: request.input.args._id,
        index: request.input.args.index,
      };

    const { body } = await client.index(esRequest);

    return body;
  }

  // context.secrets related methods ===========================================

  async testSecrets (request) {
    const expectedSecrets = request.input.body;

    should(this.context.secrets).match(expectedSecrets);

    return { result: true };
  }

  // pipes related methods =====================================================

  async pipesManage (request) {
    const payload = request.input.body;
    const state = request.input.args.state;
    const event = request.input.args.event;

    await this.sdk.ms.set(`plugin:pipes:${event}`, JSON.stringify({
      payload,
      state,
    }));

    return null;
  }

  async pipesDeactivateAll () {
    const names = await this.sdk.ms.keys('plugin:pipes:*');

    for (const name of names) {
      const pipe = JSON.parse(await this.sdk.ms.get(name));
      pipe.state = 'off';
      await this.sdk.ms.set(name, JSON.stringify(pipe));
    }

    return null;
  }

  async genericDocumentEvent (event, documents) {
    const pipe = JSON.parse(await this.sdk.ms.get(`plugin:pipes:generic:document:${event}`));

    if (! pipe || pipe.state === 'off') {
      return documents;
    }

    for (const document of documents) {
      for (const [field, value] of Object.entries(pipe.payload)) {
        /* eslint-disable-next-line no-eval */
        _.set(document, field, eval(value));
      }
    }
    return documents;
  }

  async afterNowPipe (request) {
    const pipe = JSON.parse(await this.sdk.ms.get('plugin:pipes:server:afterNow'));

    if (pipe && pipe.state !== 'off') {
      const response = request.response.result;
      response.lyrics = 'The distant future, The year 2000. The humans are dead.';
    }

    return request;
  }

  // realtime related methods =====================================================
  async subscribeOnce () {
    const roomId = await this.sdk.realtime.subscribe(
      'test',
      'question',
      {},
      async () => {
        await this.sdk.realtime.publish('test', 'answer', {});
        await this.sdk.realtime.unsubscribe(roomId);
      });
  }

  /**
   * Tests that the context.accessors.trigger method returns the results of the
   * pipe chain
   */
  async pipesTestReturn (request) {
    const helloName = await this.context.accessors.trigger(
      'testPipesReturn',
      request.input.args.name);

    return { result: helloName };
  }

  /**
   * Tests the EmbeddedSDK's impersonating feature using the new
   * ImpersonatedSDK wrapper
   */
  async createDocumentAs (request) {
    const options = {};

    if (request.input.args.checkRights !== undefined) {
      options.checkRights = request.input.args.checkRights;
    }
    const sdkInstance = this.sdk.as({ _id: request.input.args.kuid }, options);

    return sdkInstance.document.create(
      'nyc-open-data',
      'yellow-taxi',
      { shouldBeCreatedBy: request.input.args.kuid },
    );
  }

  /**
   * Use this action tool to verify impersonated actions
   */
  async testImpersonatedAction (request) {
    const { controller, action, args } = request.input.body;
    const options = {};

    if (request.input.args.checkRights !== undefined) {
      options.checkRights = request.input.args.checkRights;
    }

    const sdkInstance = this.sdk.as({ _id: request.input.args.kuid }, options);

    return sdkInstance[controller][action](...args);
  }
}

module.exports = FunctionalTestPlugin;
