import * as Hapi from "hapi";
import { IDatabase } from "../database/database";
import { IHyperledgerConfiguration, IServerConfigurations } from "../configurations";
import { LoggerInstance } from 'winston';
import * as Boom from 'boom';
import { ComposerConnection } from '../composer/composer-connection';
import { ComposerTypes } from '../composer/composer-model';
import ComposerConnectionManager from '../composer/composer-connection-manager';

export default class KeyController {

  /**
   * Constructor
   * @param {IServerConfigurations} configs
   * @param {IDatabase} database
   * @param {IHyperledgerConfiguration} hyperledger
   * @param {winston.LoggerInstance} logger
   * @param {ComposerConnection} composerConnection
   */
    constructor(
       private configs: IServerConfigurations,
       private database: IDatabase,
       private hyperledger: IHyperledgerConfiguration,
       private logger: LoggerInstance,
       private connectionManager: ComposerConnectionManager
    ) {
    }

    /**
     * API route: Get list
     * query param: resolve
     * if set to true the composer data is resolved
     * if set to false or not provided the data is not resolved
     * The difference between resolved and not resolved is that linked resources,foreign keys, will be completed resolved
     * and converted to an object
     * @param {Request} request
     * @param {ReplyNoContinue} reply
     * @returns {Promise<void>}
     */
    async getList(request: Hapi.Request, reply: Hapi.ReplyNoContinue): Promise<Hapi.Response> {
      // Get credentials from token, the token is the member email address
      const identity = request.auth.credentials.id;
      const resolve = request.query["resolve"] === "true" ? true : false;

      try {
        const composerConnection = await this.connectionManager.createBusinessNetworkConnection(identity);
        const registry = await composerConnection.getRegistry(ComposerTypes.Keys);

        if (resolve) {
          // If we resolve the data the returned data is valid json data and can be send as such
          return registry.resolveAll()
          .then((data) => composerConnection.disconnect().then(() => reply(data)));
        } else {
          // unresolved data is not valid json and cannot directly be returned through Hapi. We need to use the serializer
          return registry.getAll()
          .then((keys) => {
            let serialized = keys.map((key) => composerConnection.serializeToJSON(key));
            return composerConnection.disconnect().then(() => reply(serialized));
          });
        }
      } catch (error) {
        reply(Boom.badImplementation(error));
      }
    }

  /**
   * API route: create a new key
   * @param {Request} request
   * @param {ReplyNoContinue} reply
   * @returns {Promise<Response>}
   */
  async create(request: Hapi.Request, reply: Hapi.ReplyNoContinue): Promise<Hapi.Response> {
    let payload: any = request.payload;
    const identity = request.auth.credentials.id;
    try {
      const composerConnection = await this.connectionManager.createBusinessNetworkConnection(identity);

      // check if the entity has already been registered or not
      const registry = await composerConnection.getRegistry(ComposerTypes.Keys);
      const exists = await registry.exists(payload.id);
      if (exists) {
        await composerConnection.disconnect();
        return reply(Boom.badRequest(`key already exists`));
      } else {
        await registry.add(composerConnection.composerModelFactory.createKey(payload));
        await composerConnection.disconnect();
        return reply(payload).code(201);
      }
    } catch (error) {
      return reply(Boom.badImplementation(error));
    }
  }

  /**
   * API route: Get key by Id
   * query param: resolve
   * if set to true the composer data is resolved
   * @param {Request} request
   * @param {ReplyNoContinue} reply
   * @returns {Promise<void>}
   */
  async getById(request: Hapi.Request, reply: Hapi.ReplyNoContinue): Promise<Hapi.Response> {
    const identity = request.auth.credentials.id;
    const id = request.params["id"];
    const resolve = request.query["resolve"] === "true" ? true : false;

    try {
      const composerConnection = await this.connectionManager.createBusinessNetworkConnection(identity);
      const registry = await composerConnection.getRegistry(ComposerTypes.Keys);
      return registry.exists(id)
        .then((exists) => {
          if (exists) {
            if (resolve) {
              registry.resolve(id)
                .then((key) => {
                  return composerConnection.disconnect().then(() => reply(key));
                });
            } else {
              return registry.get(id)
                .then((key) => {
                  const output = composerConnection.serializeToJSON(key);
                  return composerConnection.disconnect().then(() => reply(output));
                });
            }
          } else {
            return composerConnection.disconnect().then(() => reply(Boom.notFound()));
          }
        });
    } catch (error) {
      reply(Boom.badImplementation(error));
    }
  }

  /**
   * API route: Delete a key
   * @param {Request} request
   * @param {ReplyNoContinue} reply
   * @returns {Promise<Response>}
   */
  async delete(request: Hapi.Request, reply: Hapi.ReplyNoContinue): Promise<Hapi.Response> {
    let id = request.params["id"];
    const identity = request.auth.credentials.id;
    try {
      const composerConnection = await this.connectionManager.createBusinessNetworkConnection(identity);
      const registry = await composerConnection.getRegistry(ComposerTypes.Keys);
      registry.exists(id)
        .then((exists) => {
          if (exists) {
            // remove the entity from the registry and revoke the identity
            return registry.remove(id)
              .then(() => composerConnection.disconnect())
              .then(() => reply({id}));
          } else {
            return composerConnection.disconnect().then(() => reply(Boom.notFound()));
          }
        });
    } catch (error) {
      return reply(Boom.badImplementation(error));
    }
  }

  /**
   * API route: Update a key
   * @param {Request} request
   * @param {ReplyNoContinue} reply
   * @returns {Promise<Response>}
   */
  async update(request: Hapi.Request, reply: Hapi.ReplyNoContinue): Promise<Hapi.Response> {
    const identity = request.auth.credentials.id;
    let id = request.params["id"];
    const payload: any = request.payload;
    try {
      const composerConnection = await this.connectionManager.createBusinessNetworkConnection(identity);
      const registry = await composerConnection.getRegistry(ComposerTypes.Keys);

      const exists =  registry.exists(id);
      if (exists) {
        let composerEntityForUpdate = await registry.get(id);
        composerEntityForUpdate = composerConnection.composerModelFactory.editKey(composerEntityForUpdate, payload);
        registry.update(composerEntityForUpdate).then(() => {
          const output = composerConnection.serializeToJSON(composerEntityForUpdate);
          return composerConnection.disconnect().then(() => {
            return reply(output);
          });
        });
      } else {
        await  composerConnection.disconnect();
        return reply(Boom.notFound());
      }
    } catch (error) {
      return reply(Boom.badImplementation(error));
    }
  }

/**
   * API route: create a new key
   * @param {Request} request
   * @param {ReplyNoContinue} reply
   * @returns {Promise<Response>}
   */
  async createKeyByTransaction(request: Hapi.Request, reply: Hapi.ReplyNoContinue): Promise<Hapi.Response> {
    let payload: any = request.payload;
    const identity = request.auth.credentials.id;
    try {
      const composerConnection = await this.connectionManager.createBusinessNetworkConnection(identity);

      // check if the entity has already been registered or not
      const registry = await composerConnection.getRegistry(ComposerTypes.Keys);
      const exists = await registry.exists(payload.id);
      if (exists) {
        await composerConnection.disconnect();
        return reply(Boom.badRequest(`key already exists`));
      } else {
        await registry.add(composerConnection.composerModelFactory.createKey(payload));
        await composerConnection.disconnect();
        return reply(payload).code(201);
      }
    } catch (error) {
      return reply(Boom.badImplementation(error));
    }
  }

  /**
   * API route: Revoke the key access with transaction
   * @param {Request} request
   * @param {ReplyNoContinue} reply
   * @returns {Promise<Response>}
   */
  /*
  async revokeAccessTransaction(request: Hapi.Request, reply: Hapi.ReplyNoContinue): Promise<Hapi.Response> {
    const identity = request.auth.credentials.id;
    let id = request.params["id"];
    const payload: any = request.payload;
    try {
      const composerConnection = await this.connectionManager.createBusinessNetworkConnection(identity);
      const registry = await composerConnection.getRegistry(ComposerTypes.key);

      const exists =  registry.exists(id);
      if (exists) {
        const transactionResourceName = composerConnection.composerModelFactory.getNamespaceForResource(ComposerTypes.ChangeDriver);
        const resource = composerConnection.serializeFromJSONObject({
          '$class': transactionResourceName,
          '': id,
          'driver': payload.driverId
        });
        const transactionResult = await composerConnection.submitTransaction(resource);
        await  composerConnection.disconnect();
        return reply(transactionResult);
      } else {
        await  composerConnection.disconnect();
        return reply(Boom.notFound());
      }
    } catch (error) {
      return reply(Boom.badImplementation(error));
    }
  }


  */
}
