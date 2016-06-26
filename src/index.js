/*!
 * @author Felix Heck <hi@whoTheHeck.de>
 * @version 0.2.0
 * @copyright Felix Heck 2016
 * @license MIT
 */

const Joi = require('joi');
const Boom = require('boom');
const errors = require('./errors');
const validate = require('./validate');
const header = require('./header');
const pkg = require('../package.json');

/**
 * @type {Object}
 * @private
 *
 * @description
 * Store internal objects
 */
const internals = {
  aka: null,
  defaults: {
    per_page: 100,
    key: 'result',
  },
  scheme: {
    per_page: Joi.number()
      .integer()
      .min(1)
      .max(500)
      .default(100),
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
  },
};

/**
 * @function
 * @private
 *
 * @description
 * Get parameter value based on the passed condition
 *
 * @param {*} param The parameter to be minimized
 * @param {*} condition The condition to be checked for
 * @returns {* | undefined} The minimized parameter value
 */
function minimizeQueryParameter(param, condition) {
  return param === condition ? undefined : param;
}

/**
 * @function
 * @private
 *
 * @description
 * Get pagination link generator with predefined values
 *
 * @param {string} id The endpoint ID
 * @param {number} per_page The number of entries per page
 * @param {Object} options The related options
 * @param {Object} query The related query parameters
 * @returns {Function} The predefined pagination link generator
 */
function getPaginationLink(id, per_page, options, query) {
  per_page = minimizeQueryParameter(per_page, options.per_page);

  return page => {
    page = minimizeQueryParameter(page, 1);

    return internals.aka(id, {
      query: Object.assign({}, query, { page, per_page }),
    });
  };
}

/**
 * @function
 * @private
 *
 * @description
 * Get entity/href mapping of necessary pagination links
 *
 * @param {string} id The endpoint ID
 * @param {number} page The requested page
 * @param {number} per_page The number of entries per page
 * @param {number} total The total number of entries
 * @param {Object} options The related options
 * @param {Object} query The related query parameters
 * @returns {Object.<?string} The mapping of pagination links
 */
function getPaginationLinks(id, page, per_page, total, options, query) {
  const getLink = getPaginationLink(id, per_page, options, query);
  const lastPage = Math.ceil(total / per_page);
  const links = {
    first: getLink(undefined),
    last: getLink(lastPage),
  };

  if (page > 1 && page <= lastPage) {
    links.prev = getLink(page - 1);
  }

  if (page < lastPage) {
    links.next = getLink(page + 1);
  }

  return links;
}

/**
 * @function
 * @public
 *
 * @description
 * Plugin to generate URIs based on ID and parameters
 *
 * @param {Object} server The server to be extended
 * @param {Object} pluginOptions The plugin options
 * @param {Function} next The callback to continue in the chain of plugins
 */
function bissle(server, pluginOptions, next) {
  server.expose('scheme', internals.scheme);
  server.dependency('akaya');

  server.decorate('reply', 'bissle', function decorator(res, options) {
    internals.aka = this.request::this.request.aka;
    options = Object.assign({}, internals.defaults, options);

    if (!validate.options(options)) {
      return this.response(Boom.badRequest(errors.invalidOptions));
    }

    if (!validate.query(this.request.query, options)) {
      return this.response(Boom.badRequest(errors.invalidQuery));
    }

    const { page, per_page } = this.request.query;
    const offset = (page - 1) * per_page;
    const total = res[options.key].length;
    const result = res[options.key].splice(offset, per_page);
    const id = this.request.route.settings.id;

    if (!id) {
      return this.response(Boom.badRequest(errors.missingId));
    }

    const links = getPaginationLinks(id, page, per_page, total, options, this.request.query);
    const linkHeader = header.getLink(links);

    this.response(Object.assign(res, {
      per_page,
      result,
      page,
      total,
      links,
    })).header('link', linkHeader);
  });

  return next();
}

bissle.attributes = {
  pkg,
};

module.exports = {
  register: bissle,
};
