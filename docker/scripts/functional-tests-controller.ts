import { Controller, KuzzleRequest } from '../../index';

export class FunctionalTestsController extends Controller {
  constructor (app) {
    super(app);

    this.definition = {
      actions: {
        helloWorld: {
          handler: this.helloWorld,
        },
        byeWorld: {
          handler: this.byeWorld
        },
        create: {
          handler: this.create,
          args: [
            { name: 'index', type: 'string' },
            { name: 'collection', type: 'string' },
            { name: 'body', type: 'JSONObject' },
          ],
          opts: {
            _id: 'string',
            refresh: 'string',
          }
        }
      }
    };
  }

  async helloWorld (request: KuzzleRequest) {
    return { greeting: `Hello, ${request.input.args.name}` };
  }

  async byeWorld () {
    // ensure the "app" property is usable
    return this.app.sdk.document.create('test', 'test', { message: 'bye' });
  }

  async create (request: KuzzleRequest) {

  }
}
