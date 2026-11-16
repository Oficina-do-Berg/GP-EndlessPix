export type AppLang = 'pt' | 'en';

export interface Translations {
  pageTitle: string;
  nav: {
    upload: string;
    history: string;
    account: string;
    mainNavLabel: string;
    mobileNavLabel: string;
    accountMenuLabel: string;
    accountShort: string;
    connectShort: string;
    activeAccount: string;
    manageAccount: string;
    signOut: string;
    languageLabel: string;
  };
  dropzone: {
    to: string;
    connectPrompt: string;
    maxSize: (limit: string) => string;
    dropActive: string;
    idleTitle: string;
    subtitle: string;
    selectFiles: string;
    selectFolder: string;
    orPaste: string;
    dismissAlert: string;
    needAccountError: string;
  };
  queue: {
    sectionLabel: string;
    uploadingTitle: (count: number) => string;
    uploadsTitle: (count: number) => string;
    inProgressTitle: (count: number) => string;
    remainingPrefix: string;
    clearCompleted: string;
    of: string;
    queuedNote: string;
    waitingNote: string;
    serverQueuedNote: string;
    serverUploadingNote: string;
    serverPausedNote: string;
    pausedPrefix: string;
    completedNote: string;
    failedFallback: string;
    statusUploading: string;
    statusServerQueued: string;
    statusServerUploading: string;
    statusQueued: string;
    statusPaused: string;
    statusSent: string;
    statusError: string;
    resumeLabel: (name: string) => string;
    pauseLabel: (name: string) => string;
    retryLabel: (name: string) => string;
    removeLabel: (name: string) => string;
  };
  footer: {
    queuedCount: (count: number) => string;
    sentCount: (count: number) => string;
    viewHistory: string;
    privacyNote: string;
  };
  history: {
    title: string;
    uploadingBadge: (count: number) => string;
    refresh: string;
    clear: string;
    searchLabel: string;
    searchPlaceholder: string;
    filterGroupLabel: string;
    filterAll: string;
    filterSent: string;
    filterError: string;
    emptyAll: string;
    emptyFiltered: string;
    sentStatus: string;
    errorStatus: string;
    retry: string;
    retryLabel: (name: string) => string;
    removeLabel: (name: string) => string;
  };
  account: {
    title: string;
    connectedCount: (count: number) => string;
    noneConnected: string;
    activeForUpload: string;
    inactive: string;
    setActive: string;
    disconnectLabel: (email: string) => string;
    connectHeading: string;
    connectHelperBefore: string;
    connectHelperAfter: string;
    emailLabel: string;
    emailPlaceholder: string;
    tokenLabel: string;
    tokenPlaceholder: string;
    showToken: string;
    hideToken: string;
    connectBtn: string;
    connectedSuccess: (email: string) => string;
  };
  signedOut: {
    title: string;
    subtitleBefore: string;
    subtitleAfter: string;
    tokenPlaceholder: string;
    signInBtn: string;
    reconnectBtn: string;
    reconnectEmpty: string;
  };
  tokenAuth: {
    buttonLabel: string;
    modalTitle: string;
    modalSubtitle: string;
    closeLabel: string;
    step1Title: string;
    step1Desc: string;
    openGoogleBtn: string;
    copyLinkBtn: string;
    copiedLabel: string;
    step2Title: string;
    step2Steps: string[];
    step2Hint: string;
    step3Title: string;
    pasteClipboardBtn: string;
    clipboardEmptyError: string;
    clipboardDeniedError: string;
    applyBtn: string;
  };
}

export const TRANSLATIONS: Record<AppLang, Translations> = {
  pt: {
    pageTitle: 'GP-EndlessPix — Envio para o Google Photos',
    nav: {
      upload: 'Enviar',
      history: 'Histórico',
      account: 'Conta',
      mainNavLabel: 'Navegação principal',
      mobileNavLabel: 'Navegação móvel',
      accountMenuLabel: 'Menu da conta',
      accountShort: 'Conta',
      connectShort: 'Conectar',
      activeAccount: 'Conta ativa',
      manageAccount: 'Gerenciar conta',
      signOut: 'Sair',
      languageLabel: 'Idioma do aplicativo',
    },
    dropzone: {
      to: 'Para',
      connectPrompt: 'Conecte uma conta para enviar',
      maxSize: (limit) => `máx. ${limit}`,
      dropActive: 'Solte para enviar',
      idleTitle: 'Solte fotos ou vídeos aqui',
      subtitle: 'Envio direto para o Google Photos.',
      selectFiles: 'Selecionar arquivos',
      selectFolder: 'Selecionar pasta',
      orPaste: 'ou cole com Ctrl+V',
      dismissAlert: 'Fechar aviso',
      needAccountError: 'Conecte uma conta Google na aba "Conta" antes de enviar arquivos.',
    },
    queue: {
      sectionLabel: 'Fila de envio',
      uploadingTitle: (count) => `Enviando (${count})`,
      uploadsTitle: (count) => `Envios (${count})`,
      inProgressTitle: (count) => `Em andamento (${count})`,
      remainingPrefix: 'faltam',
      clearCompleted: 'Limpar concluídos',
      of: 'de',
      queuedNote: 'na fila',
      waitingNote: 'aguardando vez',
      serverQueuedNote: 'no servidor · aguardando envio ao Google',
      serverUploadingNote: 'no servidor · envio em andamento',
      serverPausedNote: 'no servidor · pausado',
      pausedPrefix: 'Pausado',
      completedNote: 'concluído',
      failedFallback: 'falha no envio',
      statusUploading: 'Enviando',
      statusServerQueued: 'No servidor',
      statusServerUploading: 'Enviando ao Google',
      statusQueued: 'Na fila',
      statusPaused: 'Pausado',
      statusSent: 'Enviado',
      statusError: 'Erro',
      resumeLabel: (name) => `Retomar envio de ${name}`,
      pauseLabel: (name) => `Pausar envio de ${name}`,
      retryLabel: (name) => `Tentar novamente ${name}`,
      removeLabel: (name) => `Remover ${name} da fila`,
    },
    footer: {
      queuedCount: (count) => `${count} na fila`,
      sentCount: (count) => `${count} ${count === 1 ? 'enviado' : 'enviados'}`,
      viewHistory: 'Ver histórico',
      privacyNote: 'Apagados do servidor após o envio.',
    },
    history: {
      title: 'Histórico',
      uploadingBadge: (count) => `${count} enviando`,
      refresh: 'Atualizar',
      clear: 'Limpar',
      searchLabel: 'Buscar no histórico',
      searchPlaceholder: 'Buscar arquivo...',
      filterGroupLabel: 'Filtrar por status',
      filterAll: 'Todos',
      filterSent: 'Enviados',
      filterError: 'Erros',
      emptyAll: 'Nenhum envio registrado ainda.',
      emptyFiltered: 'Nenhum arquivo encontrado.',
      sentStatus: 'Enviado',
      errorStatus: 'Erro',
      retry: 'Reenviar',
      retryLabel: (name) => `Reenviar ${name}`,
      removeLabel: (name) => `Remover ${name} do histórico`,
    },
    account: {
      title: 'Conta Google',
      connectedCount: (count) => `${count} ${count === 1 ? 'conectada' : 'conectadas'}`,
      noneConnected: 'Nenhuma conta conectada.',
      activeForUpload: 'Ativa para envio',
      inactive: 'Inativa',
      setActive: 'Ativar',
      disconnectLabel: (email) => `Desconectar ${email}`,
      connectHeading: 'Conectar outra conta',
      connectHelperBefore: 'Copie o cookie',
      connectHelperAfter: 'da sua conta Google. Nunca compartilhe esse valor.',
      emailLabel: 'E-mail da conta (opcional)',
      emailPlaceholder: 'E-mail da conta (opcional)',
      tokenLabel: 'Cookie oauth_token',
      tokenPlaceholder: 'Cole o oauth_token aqui',
      showToken: 'Mostrar token',
      hideToken: 'Ocultar token',
      connectBtn: 'Conectar',
      connectedSuccess: (email) => `Conta ${email} conectada.`,
    },
    signedOut: {
      title: 'Sessão encerrada',
      subtitleBefore: 'Entre novamente ou cole um novo',
      subtitleAfter: 'para continuar enviando para o Google Photos.',
      tokenPlaceholder: 'Cole o oauth_token aqui',
      signInBtn: 'Entrar com token',
      reconnectBtn: 'Reconectar sessão anterior',
      reconnectEmpty: 'Nenhuma conta Google encontrada. Conecte uma conta com um token.',
    },
    tokenAuth: {
      buttonLabel: 'Pegar token autenticador',
      modalTitle: 'Pegar token autenticador',
      modalSubtitle: 'Obtenha e valide o cookie oauth_token da sua conta Google.',
      closeLabel: 'Fechar janela',
      step1Title: '1. Autenticar na conta Google',
      step1Desc: 'Abra a página de login do Google e entre na conta desejada.',
      openGoogleBtn: 'Abrir página Google',
      copyLinkBtn: 'Copiar link',
      copiedLabel: 'Copiado',
      step2Title: '2. Copiar o cookie oauth_token',
      step2Steps: [
        'Na página do Google do passo 1, pressione F12 (ou clique com o botão direito → Inspecionar).',
        'Abra a aba Application. Se ela não aparecer, clique no ícone » no topo. No Firefox, use Storage.',
        'Na lista da esquerda, abra Cookies e selecione https://accounts.google.com.',
        'Encontre o cookie oauth_token, dê dois cliques na coluna Value e copie o valor completo (Ctrl+C).',
        'Volte para esta janela e cole o valor no campo do passo 3 (Ctrl+V).',
      ],
      step2Hint: 'O valor é longo. Copie tudo, sem espaços extras.',
      step3Title: '3. Validar e conectar',
      pasteClipboardBtn: 'Colar da área de transferência',
      clipboardEmptyError: 'A área de transferência está vazia.',
      clipboardDeniedError: 'Permissão negada ao ler a área de transferência. Cole manualmente (Ctrl+V).',
      applyBtn: 'Conectar com token',
    },
  },
  en: {
    pageTitle: 'GP-EndlessPix — Upload to Google Photos',
    nav: {
      upload: 'Upload',
      history: 'History',
      account: 'Account',
      mainNavLabel: 'Main navigation',
      mobileNavLabel: 'Mobile navigation',
      accountMenuLabel: 'Account menu',
      accountShort: 'Account',
      connectShort: 'Connect',
      activeAccount: 'Active account',
      manageAccount: 'Manage account',
      signOut: 'Sign out',
      languageLabel: 'App language',
    },
    dropzone: {
      to: 'To',
      connectPrompt: 'Connect an account to upload',
      maxSize: (limit) => `max ${limit}`,
      dropActive: 'Drop to upload',
      idleTitle: 'Drop photos or videos here',
      subtitle: 'Direct upload to Google Photos.',
      selectFiles: 'Select files',
      selectFolder: 'Select folder',
      orPaste: 'or paste with Ctrl+V',
      dismissAlert: 'Dismiss alert',
      needAccountError: 'Connect a Google account in the "Account" tab before uploading files.',
    },
    queue: {
      sectionLabel: 'Upload queue',
      uploadingTitle: (count) => `Uploading (${count})`,
      uploadsTitle: (count) => `Uploads (${count})`,
      inProgressTitle: (count) => `In progress (${count})`,
      remainingPrefix: 'left:',
      clearCompleted: 'Clear completed',
      of: 'of',
      queuedNote: 'queued',
      waitingNote: 'waiting for a slot',
      serverQueuedNote: 'on server · waiting for Google',
      serverUploadingNote: 'on server · upload in progress',
      serverPausedNote: 'on server · paused',
      pausedPrefix: 'Paused',
      completedNote: 'completed',
      failedFallback: 'upload failed',
      statusUploading: 'Uploading',
      statusServerQueued: 'On server',
      statusServerUploading: 'Uploading to Google',
      statusQueued: 'Queued',
      statusPaused: 'Paused',
      statusSent: 'Sent',
      statusError: 'Error',
      resumeLabel: (name) => `Resume upload for ${name}`,
      pauseLabel: (name) => `Pause upload for ${name}`,
      retryLabel: (name) => `Retry ${name}`,
      removeLabel: (name) => `Remove ${name} from queue`,
    },
    footer: {
      queuedCount: (count) => `${count} queued`,
      sentCount: (count) => `${count} sent`,
      viewHistory: 'View history',
      privacyNote: 'Deleted from server after upload.',
    },
    history: {
      title: 'History',
      uploadingBadge: (count) => `${count} uploading`,
      refresh: 'Refresh',
      clear: 'Clear',
      searchLabel: 'Search history',
      searchPlaceholder: 'Search file...',
      filterGroupLabel: 'Filter by status',
      filterAll: 'All',
      filterSent: 'Sent',
      filterError: 'Errors',
      emptyAll: 'No uploads recorded yet.',
      emptyFiltered: 'No files found.',
      sentStatus: 'Sent',
      errorStatus: 'Error',
      retry: 'Retry',
      retryLabel: (name) => `Retry ${name}`,
      removeLabel: (name) => `Remove ${name} from history`,
    },
    account: {
      title: 'Google Account',
      connectedCount: (count) => `${count} connected`,
      noneConnected: 'No accounts connected.',
      activeForUpload: 'Active for uploads',
      inactive: 'Inactive',
      setActive: 'Set active',
      disconnectLabel: (email) => `Disconnect ${email}`,
      connectHeading: 'Connect another account',
      connectHelperBefore: 'Copy the',
      connectHelperAfter: 'cookie from your Google account. Never share this value.',
      emailLabel: 'Account email (optional)',
      emailPlaceholder: 'Account email (optional)',
      tokenLabel: 'oauth_token cookie',
      tokenPlaceholder: 'Paste oauth_token here',
      showToken: 'Show token',
      hideToken: 'Hide token',
      connectBtn: 'Connect',
      connectedSuccess: (email) => `Account ${email} connected.`,
    },
    signedOut: {
      title: 'Signed out',
      subtitleBefore: 'Sign in again or paste a new',
      subtitleAfter: 'to keep uploading to Google Photos.',
      tokenPlaceholder: 'Paste oauth_token here',
      signInBtn: 'Sign in with token',
      reconnectBtn: 'Reconnect previous session',
      reconnectEmpty: 'No Google account found. Connect one with a token.',
    },
    tokenAuth: {
      buttonLabel: 'Get authenticator token',
      modalTitle: 'Get authenticator token',
      modalSubtitle: 'Retrieve and validate your Google account oauth_token cookie.',
      closeLabel: 'Close dialog',
      step1Title: '1. Sign in to Google',
      step1Desc: 'Open the Google login page and sign in to your target account.',
      openGoogleBtn: 'Open Google page',
      copyLinkBtn: 'Copy link',
      copiedLabel: 'Copied',
      step2Title: '2. Copy the oauth_token cookie',
      step2Steps: [
        'On the Google page from step 1, press F12 (or right-click → Inspect).',
        'Open the Application tab. If it is hidden, click the » icon. In Firefox, use Storage.',
        'In the left sidebar, open Cookies and select https://accounts.google.com.',
        'Find the oauth_token cookie, double-click its Value cell, and copy the full value (Ctrl+C).',
        'Come back to this window and paste the value into the step 3 field (Ctrl+V).',
      ],
      step2Hint: 'The value is long. Copy all of it, without extra spaces.',
      step3Title: '3. Validate & connect',
      pasteClipboardBtn: 'Paste from clipboard',
      clipboardEmptyError: 'Your clipboard is empty.',
      clipboardDeniedError: 'Clipboard access blocked. Paste manually with Ctrl+V.',
      applyBtn: 'Connect with token',
    },
  },
};
