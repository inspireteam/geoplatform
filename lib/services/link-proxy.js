'use strict'

const got = require('../got')

const {LINK_PROXY_URL} = process.env

async function proxyLink(location) {
  const {body} = await got.post(LINK_PROXY_URL, {
    json: true,
    body: {
      location
    }
  })

  return body
}

async function getLink(proxyId) {
  try {
    const {body} = await got(`${LINK_PROXY_URL}/${proxyId}`, {
      json: true
    })

    return body
  } catch (error) {
    if (error.statusCode === 404) {
      return null
    }

    throw error
  }
}

async function getLinkByLocation(location) {
  try {
    const {body} = await got(`${LINK_PROXY_URL}`, {
      query: {
        location
      },
      json: true
    })

    return body
  } catch (error) {
    if (error.statusCode === 404) {
      return null
    }

    throw error
  }
}

async function getLastCheck(proxyId) {
  const {body} = await got(`${LINK_PROXY_URL}/${proxyId}/checks/latest`, {
    json: true
  })

  return body
}

module.exports = {proxyLink, getLink, getLinkByLocation, getLastCheck}
