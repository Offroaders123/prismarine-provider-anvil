declare module "uint4" {
  /**
   * @param {Buffer} buffer
   * @param {number} cursor
   * @returns {number}
   */
  export function readUInt4BE(buffer: Buffer, cursor: number): number;
  /**
   * @param {Buffer} buffer
   * @param {number} value
   * @param {number} cursor
   * @returns {void}
   */
  export function writeUInt4BE(buffer: Buffer, value: number, cursor: number): void;
  /**
   * @param {Buffer} buffer
   * @param {number} cursor
   * @returns {number}
   */
  export function readUInt4LE(buffer: Buffer, cursor: number): number;
  /**
   * @param {Buffer} buffer
   * @param {number} value
   * @param {number} cursor
   * @returns {void}
   */
  export function writeUInt4LE(buffer: Buffer, value: number, cursor: number): void;
  export { readUInt4BE as read, readUInt4BE as readUInt4, writeUInt4BE as write, writeUInt4BE as writeUInt4 };
}