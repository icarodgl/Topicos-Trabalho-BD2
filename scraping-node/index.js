// Import de libs
const rp = require('request-promise')
const cheerio = require('cheerio')
const _ = require('lodash')
const fs = require('fs')
const iconv = require('iconv-lite')
const log = require('pretty-log')
// -- fim import libs

let dados = [] // dados tratados vindo do site
let progress = 0 // progresso atual da obtenção de dados

/**
 * Get default request promise options for scraping
 * 
 * @param {number} [page=0] 
 * @returns 
 */
function getOptionsOLX(page = Math.round(Math.random() * 10), state = 'es') {
  return {
    uri: `http://${state}.olx.com.br/imoveis?o=${page}`,
    encoding: null,
    transform: html => {
      return cheerio.load(iconv.decode(html, 'ISO-8859-1'), { decodeEntities: false })
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36'
    }
  }
}

/**
 * Tratamento da região do anúncio
 * 
 * @param {any} el 
 * @returns 
 */
function tratamentoRegiao(el) {
  return el.trim().split('-').map(a => a.trim()).filter(b => b.length)
}

/**
 * Preencher array com dados minerados do site
 * 
 * @param {number} [number=1] 
 * @param {string} [state='es'] 
 * @returns 
 */
function fillDados(number = 1, state = 'es') {

  return new Promise((resolve, reject) => {
    resolve(
      _fillDados(1, state)
    )
  })

  /**
   * Função interna para recursão
   * 
   * @param {number} [index=1] 
   * @param {string} [estado='es'] 
   * @returns 
   */
  function _fillDados(index = 1, estado = 'es') {
    let options = getOptionsOLX(index, estado)
    return rp(options)
      .then($ => {
        progress += (1 / number) * 100
        const list = $('div.section_OLXad-list')
        list.find('li.item').filter(function (i, el) {
          el = $(el)
          return el.attr('class') === 'item'
        }).each(function (i, item) {
          item = $(item)
          const data = new Date().toLocaleDateString('pt-br')
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

          dados.push({
            tipo, area, data, bairro, cidade, categoria, preco, id, estado: estado.toUpperCase(), pais: 'BRA'
          })

        })
        return index < number ? _fillDados(++index, estado) : Promise.resolve()
      })
  }

}

/**
 * Monitor de atividade
 * para informar o progresso atual, memória usada, etc...
 */
monitor = {
  _keep: true,
  _clear: () => {
    process.stdout.clearLine();  // clear current text
    process.stdout.cursorTo(0);  // move cursor to beginning of line
  },
  state: 'es',
  start: monitorStart,
  end: () => {
    monitor._keep = false;
    monitor._clear();
  }
}

/**
 * Fixar casas decimais dado
 * 
 * @param {any} n 
 * @param {number} [fixed=2] 
 * @returns 
 */
function fix2decimals(n, fixed = 2) {
  return parseFloat(Math.round(n * 100) / 100).toFixed(fixed)
}

/**
 * Iniciar o log do monitor de atividade
 * 
 * @param {number} [i=0] 
 * @returns 
 */
function monitorStart(i = 0) {
  if (monitor._keep) {
    if (i > 2) { i = -1 }
    monitor._clear()
    process.stdout.write(
      `${fix2decimals(progress, 0)}%  | Estado: ${monitor.state.toUpperCase()} | Memória utilizada: ${fix2decimals(process.memoryUsage().rss / 1024 / 1024)} Mb | Obtendo dados${new Array(i+1).fill('.').join('')}`
    )
    return setTimeout(() => monitorStart(++i), 200)
  }
}

/**
 * Main
 * 
 * @param {any} [_args=process.argv] 
 */
function main(_args = process.argv) {
  args = {}
  _args.forEach(arg => { 
    a = arg.toLowerCase().split('=')
    args[a[0]] = a.length === 2 ? a[1] : a[0]
  })

  monitor.state = args.state || 'es'
  monitor.start()

  fillDados(args.number, args.state)
    .then(() => {
      monitor.end()
      const filename = args.filename || `dados/dados_${args.state}.json`
      fs.writeFileSync(filename, JSON.stringify(dados), err => { throw err })
      setTimeout(() => log.success(`Dados gerados com sucesso no arquivo ${filename}!`), 200)
    })
    .catch(err => {
      log.error(err)
      throw err
    })

}

main() // Iniciando a aplicação