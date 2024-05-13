const nbt = require('prismarine-nbt')
const neededBits = require('prismarine-chunk/src/pc/common/neededBits')

/**
 * @param {number} mcVersion
 * @param {number} worldVersion
 * @param {boolean} noSpan
 */
module.exports = (mcVersion, worldVersion, noSpan) => {
  const BitArray = require(`prismarine-chunk/src/pc/common/BitArray${noSpan ? 'NoSpan' : ''}`)
  const ChunkSection = require('prismarine-chunk')(mcVersion).section

  /**
   * @param {typeof import('prismarine-chunk').PCChunk} Chunk
   * @param mcData
   */
  return (Chunk, mcData) => {
    /**
     * @param {nbt.NBT} data
     * @returns {import('prismarine-chunk').PCChunk}
     */
    function nbtChunkToPrismarineChunk (data) {
      const nbtd = nbt.simplify(data)
      const chunk = new Chunk()
      readSections(chunk, nbtd.Level.Sections)
      chunk.biomes = nbtd.Level.Biomes
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
              Biomes: { value: chunk.biomes, type: 'intArray' },
              Sections: writeSections(chunk),
              isLightOn: { // Vanilla server will discard light data if this is missing
                type: 'byte',
                value: 1
              },
              Status: { // Vanilla server will discard block data if this is missing
                type: 'string',
                value: 'full'
              },
              shouldSave: { // Force vanilla server to regenerate missing properties like heightmaps
                type: 'byte',
                value: 1
              },
              xPos: {
                type: 'int',
                value: chunkXPos
              },
              zPos: {
                type: 'int',
                value: chunkZPos
              }
            }
          },
          DataVersion: { // Vanilla server will discard Level->Status field if this is missing
            type: 'int',
            value: worldVersion
          }
        }
      }
    }

    /**
     * @param {import('prismarine-chunk').PCChunk & { sectionMask: number; blockLightMask: number; skyLightMask: number; blockLightSections: { data: number[]; }[]; skyLightSections: { data: number[]; }[]; }} chunk
     * @param {import('prismarine-chunk').PCChunk['sections']} sections
     * @returns {void}
     */
    function readSections (chunk, sections) {
      sections.forEach(section => readSection(chunk, section))
    }

    /**
     * @param {import('prismarine-chunk').PCChunk & { blockLightSections: { data: number[]; }[]; skyLightSections: { data: number[]; }[]; }} chunk
     * @returns {{ type: string; value: { type: string; value: import('prismarine-chunk').PCChunk['sections']; }; }}
     */
    function writeSections (chunk) {
      /** @type {import('prismarine-chunk').PCChunk['sections']} */
      const sections = []
      for (let sectionY = 0; sectionY < 16; sectionY++) {
        const section = chunk.sections[sectionY]
        if (section) sections.push(writeSection(section, sectionY, chunk.blockLightSections[sectionY + 1], chunk.skyLightSections[sectionY + 1]))
      }

      return {
        type: 'list',
        value: {
          type: 'compound',
          value: sections
        }
      }
    }

    /**
     * @param {import('prismarine-chunk').PCChunk & { sectionMask: number; blockLightMask: number; skyLightMask: number; blockLightSections: { data: number[]; }[]; skyLightSections: { data: number[]; }[]; }} chunk
     * @param {import('prismarine-chunk').PCChunk['sections'][number]} section
     * @returns {void}
     */
    function readSection (chunk, section) {
      if (section.Y >= 0 && section.Y <= 16) {
        let chunkSection = chunk.sections[section.Y]
        if (!chunkSection) {
          chunkSection = new ChunkSection()
          chunk.sections[section.Y] = chunkSection
          chunk.sectionMask |= 1 << section.Y
        }

        readPalette(chunkSection, section.Palette)
        // Empty (filled with air) sections can be stored, but make the client crash if
        // they are sent over. Remove them as soon as possible
        if (chunkSection.palette.length === 1 && chunkSection.palette[0] === 0) {
          chunk.sections[section.Y] = null
          chunk.sectionMask &= ~(1 << section.Y)
          return
        }
        readBlocks(chunkSection, section.BlockStates)
      }
      if (section.BlockLight) {
        chunk.blockLightMask |= 1 << (section.Y + 1)
        chunk.blockLightSections[section.Y + 1] = new BitArray({
          bitsPerValue: 4,
          capacity: 4096
        })
        readByteArray(chunk.blockLightSections[section.Y + 1], section.BlockLight)
      }
      if (section.SkyLight) {
        chunk.skyLightMask |= 1 << (section.Y + 1)
        chunk.skyLightSections[section.Y + 1] = new BitArray({
          bitsPerValue: 4,
          capacity: 4096
        })
        readByteArray(chunk.skyLightSections[section.Y + 1], section.SkyLight)
      }
    }

    /**
     * @param {string} value
     * @param {{ type: string; values: string[]; }} state
     * @returns {number}
     */
    function parseValue (value, state) {
      if (state.type === 'enum') {
        return state.values.indexOf(value)
      }
      if (value === 'true') return 0
      if (value === 'false') return 1
      return parseInt(value, 10)
    }

    /**
     * @param {{ name: string; type: string; values: string[]; num_values: number; }[]} states
     * @param {string} name
     * @param {string} value
     * @returns {number}
     */
    function getStateValue (states, name, value) {
      let offset = 1
      for (let i = states.length - 1; i >= 0; i--) {
        const state = states[i]
        if (state.name === name) {
          return offset * parseValue(value, state)
        }
        offset *= state.num_values
      }
      return 0
    }

    /**
     * @param {import('prismarine-chunk').PCChunk['sections'][number]} section
     * @param {{ Properties?: Record<string, any>; Name: string; }[]} palette
     * @returns {void}
     */
    function readPalette (section, palette = []) {
      section.palette = []
      for (const type of palette) {
        const name = type.Name.split(':')[1]
        const block = mcData.blocksByName[name]
        let data = 0
        if (type.Properties) {
          for (const [key, value] of Object.entries(type.Properties)) {
            data += getStateValue(block.states, key, value)
          }
        }
        const stateId = block.minStateId + data
        section.palette.push(stateId)
      }
    }

    /**
     * @param {import('prismarine-chunk').PCChunk['sections'][number]} section
     * @param {[number, number][]} blockStates
     * @returns {void}
     */
    function readBlocks (section, blockStates = []) {
      section.data = section.data.resizeTo(Math.max(4, neededBits(section.palette.length - 1)))
      for (let i = 0; i < blockStates.length; i++) {
        section.data.data[i * 2] = blockStates[i][1] >>> 0
        section.data.data[i * 2 + 1] = blockStates[i][0] >>> 0
      }

      section.solidBlockCount = 0
      for (let i = 0; i < 4096; i++) {
        if (section.data.get(i) !== 0) {
          section.solidBlockCount += 1
        }
      }
    }

    /**
     * @param {number} a
     * @param {number} b
     * @param {number} c
     * @param {number} d
     * @returns {number}
     */
    function makeUInt (a, b, c, d) {
      return (((a & 0xFF) << 24) | ((b & 0xFF) << 16) | ((c & 0xFF) << 8) | (d & 0xFF)) >>> 0
    }

    /**
     * @param {{ data: number[]; }} bitArray
     * @param {number[]} array
     * @returns {void}
     */
    function readByteArray (bitArray, array) {
      for (let i = 0; i < bitArray.data.length; i += 2) {
        const i4 = i * 4
        bitArray.data[i + 1] = makeUInt(array[i4], array[i4 + 1], array[i4 + 2], array[i4 + 3])
        bitArray.data[i] = makeUInt(array[i4 + 4], array[i4 + 5], array[i4 + 6], array[i4 + 7])
      }
    }

    /**
     * @param {import('prismarine-chunk').PCChunk['sections'][number]} section
     * @param {number} sectionY
     * @param {{ data: number[]; }} blockLight
     * @param {{ data: number[]; }} skyLight
     * @returns {import('prismarine-chunk').PCChunk['sections'][number]}
     */
    function writeSection (section, sectionY, blockLight, skyLight) {
      /** @type {import('prismarine-chunk').PCChunk['sections'][number]} */
      const nbtSection = {}
      nbtSection.Y = {
          type: 'byte',
          value: sectionY
      }
      nbtSection.BlockStates = writeBlocks(section.data)
      if (section.palette !== null) nbtSection.Palette = writePalette(section.palette)
      if (blockLight !== null) nbtSection.BlockLight = writeByteArray(blockLight)
      if (skyLight !== null) nbtSection.SkyLight = writeByteArray(skyLight)
      return nbtSection
    }

    /**
     * @param {{ type: string; values: any[]; }} state
     * @param {any} value
     * @returns {string}
     */
    function writeValue (state, value) {
      if (state.type === 'enum') return state.values[value]
      if (state.type === 'bool') return value ? 'false' : 'true'
      return value + ''
    }

    /**
     * @param {number[]} palette
     * @returns {{ type: 'list'; value: { type: 'compound'; value: { Properties?: { type: 'compound'; value: Record<string, any>; }; Name: { type: 'string'; value: string; }; }[]; }; }}
    */
    function writePalette (palette) {
      /** @type {{ Properties?: { type: 'compound'; value: Record<string, any>; }; Name: { type: 'string'; value: string; }; }[]} */
      const nbtPalette = []
      for (const state of palette) {
        const block = mcData.blocksByStateId[state]
        /** @type {{ Properties?: { type: 'compound'; value: Record<string, any>; }; Name: { type: 'string'; value: string; }; }} */
        const nbtBlock = {}
        if (block.states.length > 0) {
          let data = state - block.minStateId
          nbtBlock.Properties = { type: 'compound', value: {} }
          for (let i = block.states.length - 1; i >= 0; i--) {
            const prop = block.states[i]
            nbtBlock.Properties.value[prop.name] = { type: 'string', value: writeValue(prop, data % prop.num_values) }
            data = Math.floor(data / prop.num_values)
          }
        }
        nbtBlock.Name = { type: 'string', value: 'minecraft:' + block.name }
        nbtPalette.push(nbtBlock)
      }
      return { type: 'list', value: { type: 'compound', value: nbtPalette } }
    }

    /**
     * @param {{ data: number[]; }} blocks
     * @returns {{ type: 'longArray'; value: [number, number][]; }}
     */
    function writeBlocks (blocks) {
      /** @type {[number, number][]} */
      const buffer = new Array(blocks.data.length / 2)
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = [blocks.data[i * 2 + 1] << 0, blocks.data[i * 2] << 0]
      }
      return {
        type: 'longArray',
        value: buffer
      }
    }

    /**
     * @param {{ data: number[]; }} bitArray
     * @returns {{ type: 'byteArray'; value: number[]; }}
     */
    function writeByteArray (bitArray) {
      /** @type {number[]} */
      const buffer = []
      for (let i = 0; i < bitArray.data.length; i += 2) {
        let a = bitArray.data[i + 1]
        buffer.push(((a >> 24) & 0xFF) << 24 >> 24)
        buffer.push(((a >> 16) & 0xFF) << 24 >> 24)
        buffer.push(((a >> 8) & 0xFF) << 24 >> 24)
        buffer.push((a & 0xFF) << 24 >> 24)
        a = bitArray.data[i]
        buffer.push(((a >> 24) & 0xFF) << 24 >> 24)
        buffer.push(((a >> 16) & 0xFF) << 24 >> 24)
        buffer.push(((a >> 8) & 0xFF) << 24 >> 24)
        buffer.push((a & 0xFF) << 24 >> 24)
      }
      return {
        type: 'byteArray',
        value: buffer
      }
    }

    return { nbtChunkToPrismarineChunk, prismarineChunkToNbt }
  }
}
