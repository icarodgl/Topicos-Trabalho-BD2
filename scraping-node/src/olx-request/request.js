const rp = require('request-promise')
const _ = require('lodash')
const getOptionsOLX = require('./request-options')
const monitor = require('../monitor').getInstance()

let totalStates = 0

/**
 * Obter dados da OLX de acordo com os parâmetros definidos
 * 
 * @export
 * @param {number} [number=1] 
 * @param {string} [states=['es']] 
 * @returns {Promise<Array>}
 */
module.exports = function getDados(number = 1, states = ['es']) {

  if (!(states instanceof Array) || typeof states[0] !== 'string' || states[0].length !== 2) {
    throw new Error('Erro no parâmetro "states"!')
  }
  totalStates = states.length

  return new Promise(resolve => {
    let all = []
    states.forEach(state => all.push(_fillDados(1, state, number).catch(handleError)))
    resolve(
      Promise.all(all).catch(handleError).then(res => _.union(...res))
    )
  })

}

/**
 * Função interna para recursão
 * obtém dados da olx de forma assíncrona
 * 
 * @param {number} [index=1] 
 * @param {any} estado 
 * @param {number} [number=1] 
 * @param {any} [dados=[]] 
 * @returns {Promise}
 */
function _fillDados(index = 1, estado, number = 1, dados = []) {
  let options = getOptionsOLX(index, estado)
  return rp(options)
    .catch(handleError)
    .then($ => {

      monitor.tick((1 / (totalStates * number)) * 100, {
        mem: fix2decimals(process.memoryUsage().rss / 1024 / 1024).toString()
      })

      const list = $('div.section_OLXad-list')
      list.find('li.item').filter(function (i, el) {
        el = $(el)
        return el.attr('class') === 'item'
      }).each(function (i, item) {
        item = $(item)
        const data = new Date().toJSON().split('T')[0]
        const id = Number(item.find('a.OLXad-list-link').attr('id'))
        const detalhes = item.find('p.text.detail-specific').text().trim().split('|').map(a => a ? a.trim().toLowerCase() : null)
        const regiao = _.flatten(item.find('p.text.detail-region').text().trim().split(',').map(tratamentoRegiao))
        const bairro = regiao.length < 3 ? null : regiao[1]
        const cidade = regiao[0]
        const categoria = item.find('p.detail-category').text().trim().split('-').map(a => a.trim().toLowerCase())[0]
        const tipo = detalhes[0]
        let preco = item.find('p.OLXad-list-price').text().trim().split(' ').filter(a => a.length)
        preco = preco.length === 0 ? null : Number(preco[1].replace('.', ''))
        let area = null

        detalhes.splice(0, 1)
        detalhes.forEach(detalhe => {
          let m2 = detalhe.indexOf(' m²')
          if (m2 !== -1) {
            area = Number(detalhe.slice(0, m2))
          }
        })

        dado = {
          tipo, area, data, bairro, cidade, categoria, preco, id, estado: estado.toUpperCase(), pais: 'BRA'
        }
        dados.push(dado)
      })
      return index < number ? _fillDados(++index, estado, number, dados).catch(handleError) : Promise.resolve(dados)
    })
}

/**
 * Tratamento da região do anúncio
 * 
 * @param {string} el 
 * @returns {string}
 */
function tratamentoRegiao(el) {
  return el.trim().split('-').map(a => a.trim()).filter(b => b.length)
}

/**
 * Fix decimals
 * 
 * @param {any} n 
 * @param {number} [fixed=2] 
 * @returns 
 */
function fix2decimals(n, fixed = 2) {
  return parseFloat(Math.round(n * 100) / 100).toFixed(fixed)
}

/**
 * Handle error
 * 
 * @param {any} err 
 * @returns 
 */
function handleError(err) {
  if (err) {
    return Promise.reject(err)
  }
}