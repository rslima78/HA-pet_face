// Autenticação no HA. Preferência: OAuth (getAuth) com tokens renováveis.
// Alternativa: token de longa duração de um usuário não administrador.
// Tudo fica só no localStorage deste navegador; nada é versionado.
import { Auth, createLongLivedTokenAuth, getAuth, type AuthData } from 'home-assistant-js-websocket';

const STORAGE_KEY = 'pet.auth';

type StoredAuth = { mode: 'oauth'; data: AuthData } | { mode: 'token'; hassUrl: string; token: string };

function readStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function writeStored(value: StoredAuth | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Não foi possível gravar a autenticação no localStorage.', error);
  }
}

const saveOAuthTokens = (data: AuthData | null): void => writeStored(data ? { mode: 'oauth', data } : null);

/** Aceita "http(s)://host[:porta]" com ou sem barra no fim; devolve só a origem, ou null se inválida. */
export function normalizeHassUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** URL do HA da última autenticação guardada, para preencher a tela de setup. */
export function storedHassUrl(): string | null {
  const stored = readStored();
  if (!stored) return null;
  return stored.mode === 'token' ? stored.hassUrl : stored.data.hassUrl;
}

const CALLBACK_PARAMS = ['auth_callback', 'code', 'state', 'storeToken'];
// Parâmetros que não devem voltar na URL de retorno do OAuth.
const TRANSIENT_PARAMS = [...CALLBACK_PARAMS, 'setup'];

export function isAuthCallback(): boolean {
  return new URLSearchParams(location.search).has('auth_callback');
}

/** Tira da URL os parâmetros do retorno do OAuth; o código só pode ser usado uma vez. */
export function cleanCallbackUrl(): void {
  removeParams(CALLBACK_PARAMS);
}

function removeParams(params: readonly string[]): void {
  const url = new URL(location.href);
  params.forEach((param) => url.searchParams.delete(param));
  history.replaceState(null, '', url.toString());
}

/**
 * Conclui o retorno do OAuth ou devolve a autenticação guardada.
 * null = nada guardado; a página deve mostrar o setup.
 */
export async function restoreAuth(): Promise<Auth | null> {
  if (isAuthCallback()) {
    try {
      return await getAuth({ saveTokens: saveOAuthTokens });
    } finally {
      cleanCallbackUrl();
    }
  }
  const parent = await parentHassAuth();
  if (parent) return parent;
  const stored = readStored();
  if (stored?.mode === 'token') return createLongLivedTokenAuth(stored.hassUrl, stored.token);
  if (stored) return new Auth(stored.data, saveOAuthTokens);
  const frontend = frontendTokens();
  return frontend ? new Auth(frontend, saveOAuthTokens) : null;
}

/**
 * Dentro de um painel "Página da web" do HA, a página é um iframe da mesma origem e o
 * frontend em volta expõe `hassConnection`. Usar o login dele evita um segundo login e
 * funciona também em apps (VACA, app oficial) que entregam o acesso ao HA por fora do
 * navegador, onde não há tokens no localStorage e o OAuth dentro do iframe é recusado.
 */
/** A página está dentro de outra (ex.: painel "Página da web" do HA)? */
export function isEmbedded(): boolean {
  return window.parent !== window;
}

async function parentHassAuth(): Promise<Auth | null> {
  try {
    if (window.parent === window) return null;
    // Acessar outra origem lança SecurityError; aí não é o HA em volta.
    const parent = window.parent as Window & { hassConnection?: Promise<{ auth?: Auth }> };
    if (!parent.hassConnection) {
      console.warn('Página embutida, mas a página em volta não expõe hassConnection.');
      return null;
    }
    const { auth } = await parent.hassConnection;
    return auth ?? null;
  } catch (error) {
    console.warn('Não foi possível usar o login do HA em volta:', error);
    return null;
  }
}

/**
 * Login que o próprio HA já fez neste navegador (chave `hassTokens` do frontend), quando a
 * página é servida pelo HA. Dentro do painel do HA no tablet, evita um segundo login.
 * A renovação passa a ser gravada na chave do pet; a do frontend fica intocada.
 */
function frontendTokens(): AuthData | null {
  try {
    const raw = localStorage.getItem('hassTokens');
    const data = raw ? (JSON.parse(raw) as AuthData) : null;
    return data?.refresh_token && data.hassUrl === location.origin ? data : null;
  } catch {
    return null;
  }
}

/** Redireciona para o login do HA. Volta para esta página com ?auth_callback=1. */
export function startOAuth(hassUrl: string): void {
  // getAuth usa a URL atual como retorno; sem isto, ?setup=1 voltaria e reabriria o setup.
  removeParams(TRANSIENT_PARAMS);
  void getAuth({ hassUrl, saveTokens: saveOAuthTokens });
}

export function useLongLivedToken(hassUrl: string, token: string): Auth {
  writeStored({ mode: 'token', hassUrl, token });
  return createLongLivedTokenAuth(hassUrl, token);
}

export function forgetAuth(): void {
  writeStored(null);
}
