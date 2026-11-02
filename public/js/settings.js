// Página de Definições: escolher fornecedor, modelo e chave da API. A chave nunca volta ao browser.
import { $, toast } from './util.js';
import { api } from './api.js';

const SUGGESTED = { anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'], openai: ['nvidia/nemotron-3.5-lightning-30b-a3b', 'mistralai/mistral-large-4-1t-a52b'] };
let data = null;

function fill() {
  const prov = $('#sprov').value, p = data.profiles[prov];
  $('#surlrow').hidden = prov !== 'openai';
  if (prov === 'openai') $('#surl').value = p.baseUrl || '';
  $('#smod').value = p.model || '';
  $('#smod').placeholder = prov === 'openai' ? 'nome do modelo (obrigatório)' : '';
  $('#smods').replaceChildren(...SUGGESTED[prov].map(m => Object.assign(document.createElement('option'), { value: m })));
  $('#skey').value = '';
  $('#skey').placeholder = p.hasKey ? 'Guardada (' + p.keyHint + '). Deixa vazio para manter.' : (prov === 'openai' ? 'Cola a chave (opcional em modelos locais)' : 'Cola a chave aqui');
  $('#skeyinfo').textContent = p.hasKey ? 'Chave definida' + (p.keySource ? ' (' + p.keySource + ')' : '') + '.' : 'Ainda sem chave.';
  $('#sclear').hidden = !(p.hasKey && p.keySource === 'definições');
}

export async function loadSettings() {
  try {
    data = await api('GET', '/api/settings');
    $('#sprov').value = data.provider;
    fill();
  } catch (e) { toast('Não consegui carregar as definições.'); }
}

// Uma chave da NVIDIA com o endereço da OpenAI nunca funciona: preenche o endereço e um modelo que existe nas contas gratuitas.
function nvidiaDefaults() {
  if ($('#sprov').value !== 'openai' || !$('#skey').value.trim().startsWith('nvapi-')) return;
  if (!$('#surl').value.trim() || $('#surl').value.includes('api.openai.com')) $('#surl').value = 'https://integrate.api.nvidia.com/v1';
  if (!$('#smod').value.trim()) $('#smod').value = 'nvidia/nemotron-3.5-lightning-30b-a3b';
}

async function save(extra = {}) {
  nvidiaDefaults();
  const prov = $('#sprov').value;
  if (prov === 'openai' && !$('#smod').value.trim()) { toast('Escreve o nome do modelo.'); return false; }
  const body = { provider: prov, model: $('#smod').value, apiKey: $('#skey').value, ...extra };
  if (prov === 'openai') body.baseUrl = $('#surl').value;
  try {
    data = await api('PUT', '/api/settings', body);
    fill();
    return true;
  } catch (e) { toast(e.code === 'pedido' ? 'Valores inválidos. Confirma o endereço, o modelo e a chave.' : 'Não consegui guardar.'); return false; }
}

export function initSettings() {
  $('#sprov').onchange = () => { if (data) fill(); };
  $('#sp').onsubmit = async e => { e.preventDefault(); if (await save()) toast('Definições guardadas.'); };
  $('#sclear').onclick = async () => { if (await save({ apiKey: '', clearKey: true })) toast('Chave apagada.'); };
  $('#stest').onclick = async () => {
    if (!(await save())) return;
    toast('A testar…');
    try { await api('POST', '/api/settings/test'); toast('Ligação ao modelo a funcionar.'); }
    catch (e) {
      toast(e.code === 'sem_chave' ? 'Falta a chave ou o modelo.' : e.code === 'chave' ? 'O fornecedor recusou a chave.' : e.status === 429 ? 'Limite de pedidos atingido. Tenta daqui a pouco.' : 'O modelo não respondeu' + (e.detail ? ` (${e.upstream}: ${e.detail})` : '') + '. Confirma o endereço e o nome do modelo.');
    }
  };
}
