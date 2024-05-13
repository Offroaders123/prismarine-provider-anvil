const nbt = require('prismarine-nbt')
const Vec3 = require('vec3').Vec3
const { readUInt4LE, writeUInt4LE } = require('uint4')

/**
 * @param {typeof import('prismarine-chunk').PCChunk} Chunk
 * @param mcData
 */
module.exports = (Chunk, mcData) => {
  /**
   * @param {nbt.NBT} data
   */
  function nbtChunkToPrismarineChunk (data) {
    const nbtd = nbt.simplify(data)
    const chunk = new Chunk()
    readSections(chunk, nbtd.Level.Sections)
    readBiomes(chunk, nbtd.Level.Biomes)
    return chunk
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} chunkXPos
   * @param {number} chunkZPos
   */
  function prismarineChunkToNbt (chunk, chunkXPos, chunkZPos) {
    return {
      name: '',
      type: 'compound',
      value: {
        Level: {
          type: 'compound',
          value: {
            Biomes: writeBiomes(chunk),
            Sections: writeSections(chunk),
            xPos: {
              type: 'int',
              value: chunkXPos
            },
            zPos: {
              type: 'int',
              value: chunkZPos
            }
          }
        }
      }
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {ReturnType<typeof writeSections>['value']['value']} sections
   * @returns {void}
   */
  function readSections (chunk, sections) {
    sections.forEach(section => readSection(chunk, section))
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   */
  function writeSections (chunk) {
    const sections = []
    for (let sectionY = 0; sectionY < 16; sectionY++) { sections.push(writeSection(chunk, sectionY)) }

    return {
      type: 'list',
      value: {
        type: 'compound',
        value: sections
      }
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {import('prismarine-chunk').PCChunk['sections'][number]} section
   */
  function readSection (chunk, { Y, Blocks, Add, Data, BlockLight, SkyLight }) {
    readBlocks(chunk, Y, Blocks, Add)
    readSkyLight(chunk, Y, SkyLight)
    readBlockLight(chunk, Y, BlockLight)
    readData(chunk, Y, Data)
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   */
  function writeSection (chunk, sectionY) {
    return {
      Y: {
        type: 'byte',
        value: sectionY
      },
      Blocks: writeBlocks(chunk, sectionY),
      Data: writeData(chunk, sectionY),
      BlockLight: writeBlockLight(chunk, sectionY),
      SkyLight: writeSkyLight(chunk, sectionY)
    }
  }

  /**
   * @param {number} index
   * @param {number} sectionY
   * @returns {Vec3}
   */
  function indexToPos (index, sectionY) {
    const y = index >> 8
    const z = (index >> 4) & 0xf
    const x = index & 0xf
    return new Vec3(x, sectionY * 16 + y, z)
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @param {number[]} blocksParam
   * @param {number[]} add
   * @returns {void}
   */
  function readBlocks (chunk, sectionY, blocksParam, add) {
    let blocks = Buffer.from(blocksParam)
    for (let index = 0; index < blocks.length; index++) {
      const blockType = blocks.readUInt8(index)
      const addBlockType = add ? readUInt4LE(Buffer.from(add), index / 2) : 0
      const pos = indexToPos(index, sectionY)
      chunk.setBlockType(pos, blockType + (addBlockType << 8))
    }
  }

  /**
   * @param {Buffer} buffer
   * @returns {number[]}
   */
  function toSignedArray (buffer) {
    /** @type {number[]} */
    const arr = []
    for (let index = 0; index < buffer.length; index++) { arr.push(buffer.readInt8(index)) }
    return arr
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @returns {{ type: 'byteArray'; value: number[]; }}
   */
  function writeBlocks (chunk, sectionY) {
    const buffer = Buffer.alloc(16 * 16 * 16)
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          buffer.writeUInt8(chunk.getBlockType(new Vec3(x, y + sectionY * 16, z)), x + 16 * (z + 16 * y))
        }
      }
    }
    return {
      type: 'byteArray',
      value: toSignedArray(buffer)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @param {number[]} metadataParam
   * @returns {void}
   */
  function readData (chunk, sectionY, metadataParam) {
    let metadata = Buffer.from(metadataParam)
    for (let index = 0; index < metadata.length; index += 0.5) {
      const meta = readUInt4LE(metadata, index)
      const pos = indexToPos(index * 2, sectionY)
      chunk.setBlockData(pos, meta)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @returns {{ type: 'byteArray'; value: number[]; }}
   */
  function writeData (chunk, sectionY) {
    const buffer = Buffer.alloc(16 * 16 * 8)
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) { writeUInt4LE(buffer, chunk.getBlockData(new Vec3(x, y + sectionY * 16, z)), (x + 16 * (z + 16 * y)) * 0.5) }
      }
    }
    return {
      type: 'byteArray',
      value: toSignedArray(buffer)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @param {number[]} blockLightsParam
   * @returns {void}
   */
  function readBlockLight (chunk, sectionY, blockLightsParam) {
    let blockLights = Buffer.from(blockLightsParam)
    for (let index = 0; index < blockLights.length; index += 0.5) {
      const blockLight = readUInt4LE(blockLights, index)
      const pos = indexToPos(index * 2, sectionY)
      chunk.setBlockLight(pos, blockLight)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @returns {{ type: 'byteArray'; value: number[]; }}
   */
  function writeBlockLight (chunk, sectionY) {
    const buffer = Buffer.alloc(16 * 16 * 8)
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) { writeUInt4LE(buffer, chunk.getBlockLight(new Vec3(x, y + sectionY * 16, z)), (x + 16 * (z + 16 * y)) * 0.5) }
      }
    }
    return {
      type: 'byteArray',
      value: toSignedArray(buffer)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @param {number[]} skylightsParam
   * @returns {void}
   */
  function readSkyLight (chunk, sectionY, skylightsParam) {
    let skylights = Buffer.from(skylightsParam)
    for (let index = 0; index < skylights.length; index += 0.5) {
      const skylight = readUInt4LE(skylights, index)
      const pos = indexToPos(index * 2, sectionY)
      chunk.setSkyLight(pos, skylight)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number} sectionY
   * @returns {{ type: 'byteArray'; value: number[]; }}
   */
  function writeSkyLight (chunk, sectionY) {
    const buffer = Buffer.alloc(16 * 16 * 8)
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) { writeUInt4LE(buffer, chunk.getSkyLight(new Vec3(x, y + sectionY * 16, z)), (x + 16 * (z + 16 * y)) * 0.5) }
      }
    }
    return {
      type: 'byteArray',
      value: toSignedArray(buffer)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @param {number[]} biomesParam
   * @returns {void}
   */
  function readBiomes (chunk, biomesParam) {
    let biomes = Buffer.from(biomesParam)
    for (let index = 0; index < biomes.length; index++) {
      const biome = biomes.readUInt8(index)
      const z = index >> 4
      const x = index & 0xF
      chunk.setBiome(new Vec3(x, 0, z), biome)
    }
  }

  /**
   * @param {import('prismarine-chunk').PCChunk} chunk
   * @returns {{ value: number[]; type: 'byteArray'; }}
   */
  function writeBiomes (chunk) {
    /** @type {number[]} */
    const biomes = []
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) { biomes.push(chunk.getBiome(new Vec3(x, 0, z))) }
    }
    return {
      value: biomes,
      type: 'byteArray'
    }
  }

  return { nbtChunkToPrismarineChunk, prismarineChunkToNbt }
}
