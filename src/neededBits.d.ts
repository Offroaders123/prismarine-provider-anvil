declare module "prismarine-chunk/src/pc/common/neededBits" {
  export = neededBits;
  /**
   * Gives the number of bits needed to represent the value
   * @param {number} value
   * @returns {number} bits
   */
  function neededBits(value: number): number;
}