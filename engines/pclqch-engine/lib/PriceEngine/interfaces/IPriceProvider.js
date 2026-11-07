'use strict';
class IPriceProvider {
  constructor(config) {
    this.config = config;
  }
  getName() {
    throw new Error(
      'getName() must be implemented.'
    );
  }
  isEnabled() {
    throw new Error(
      'isEnabled() must be implemented.'
    );
  }
  supports(request) {
    throw new Error(
      'supports() must be implemented.'
    );
  }
  async getPrice(request) {
    throw new Error(
      'getPrice() must be implemented.'
    );
  }
  async healthCheck() {
    throw new Error(
      'healthCheck() must be implemented.'
    );
  }
  async destroy() {
    // Optional
  }
}
module.exports = IPriceProvider;