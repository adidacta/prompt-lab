// Prompt Lab - Step-Based Conversational Prompt Builder
// Refactored: Flow is controlled by JS, Claude only generates contextual suggestions

// ============================================
// INTERVIEW STEPS CONFIGURATION
// ============================================
const INTERVIEW_STEPS = [
  {
    id: 'task',
    field: 'task',
    question: 'מה תרצה ליצור היום?',
    icon: '🎯',
    defaultSuggestions: ['מצגת', 'אפליקציה', 'תוכן שיווקי', 'מסמך טכני'],
    placeholder: 'טרם הוגדר'
  },
  {
    id: 'audience',
    field: 'role', // maps to "role" in canvas (who it's for = context/role)
    question: 'למי זה מיועד?',
    icon: '👥',
    defaultSuggestions: ['לקוחות', 'הנהלה', 'מפתחים', 'לעצמי'],
    placeholder: 'טרם נבחר'
  },
  {
    id: 'format',
    field: 'format',
    question: 'באיזה פורמט או מבנה?',
    icon: '📄',
    defaultSuggestions: ['נקודות תמציתיות', 'קוד עובד', 'מסמך מפורט', 'מוקאפ/עיצוב'],
    placeholder: 'טרם נבחר'
  },
  {
    id: 'tone',
    field: 'tone',
    question: 'באיזה טון וסגנון?',
    icon: '🎨',
    defaultSuggestions: ['רשמי ומקצועי', 'טכני ומדויק', 'ידידותי וקליט', 'משכנע ומעורר'],
    placeholder: 'טרם נבחר'
  },
  {
    id: 'details',
    field: 'details',
    question: 'יש פרטים ספציפיים שחשוב לכלול?',
    icon: '📝',
    defaultSuggestions: ['נתונים ומספרים', 'דוגמאות קוד', 'תמונות והדגמות', 'אין דרישות מיוחדות'],
    placeholder: 'אין פרטים נוספים'
  },
  {
    id: 'constraints',
    field: 'constraints',
    question: 'יש הגבלות כלשהן?',
    icon: '📏',
    defaultSuggestions: ['עד עמוד אחד', 'React/TypeScript', 'תקציב מוגבל', 'אין הגבלות'],
    placeholder: 'אין הגבלות'
  }
];

// ============================================
// APPLICATION STATE
// ============================================
const state = {
  currentStep: 0,
  answers: {}, // { task: "מצגת", audience: "ראש העיר", ... }
  conversationHistory: [],
  currentPrompt: '',
  isLoading: false,
  isComplete: false,
  // Gallery state
  gallery: [],
  galleryActiveTab: 'all', // 'all' or a task category
  gallerySearchQuery: '',
  // Conversation mode (after running prompt)
  inConversationMode: false,
  promptConversation: [],
  // Mobile drawer state
  drawerOpen: false
};

// ============================================
// SUPABASE CLIENT
// ============================================
const SUPABASE_URL = 'https://smirvaqigakngzlvyctq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaXJ2YXFpZ2Frbmd6bHZ5Y3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDI5NzEsImV4cCI6MjA4NTY3ODk3MX0.uX83Jqlt9X0IQD9I6lQmNZO7bbwbFnuu2a_LmSHgYyk';

let supabaseClient = null;

function initSupabase() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ============================================
// GALLERY DATA LAYER (Supabase)
// ============================================

async function loadGallery() {
  try {
    const client = initSupabase();
    if (!client) {
      console.warn('Supabase not available, using empty gallery');
      state.gallery = [];
      return;
    }

    const { data, error } = await client
      .from('prompts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform Supabase data to app format
    state.gallery = (data || []).map(row => ({
      id: row.id,
      createdAt: new Date(row.created_at).getTime(),
      title: row.title,
      promptText: row.prompt_text,
      labels: row.labels || {}
    }));
  } catch (e) {
    console.error('Error loading gallery from Supabase:', e);
    state.gallery = [];
  }
}

function generateTitle(answers) {
  const task = answers.task || '';
  const audience = answers.audience || '';
  if (task && audience) {
    return `${task} ל${audience}`;
  }
  return task || 'פרומפט ללא כותרת';
}

async function publishPrompt() {
  if (!state.currentPrompt || !state.isComplete) {
    showToast('יש להשלים את הפרומפט לפני פרסום');
    return;
  }

  const client = initSupabase();
  if (!client) {
    showToast('שגיאה בחיבור לשרת');
    return;
  }

  const promptData = {
    title: generateTitle(state.answers),
    prompt_text: state.currentPrompt,
    labels: {
      task: state.answers.task || '',
      audience: state.answers.audience || '',
      format: state.answers.format || '',
      tone: state.answers.tone || '',
      details: state.answers.details || '',
      constraints: state.answers.constraints || ''
    }
  };

  try {
    const { data, error } = await client
      .from('prompts')
      .insert([promptData])
      .select()
      .single();

    if (error) throw error;

    // Add to local state
    state.gallery.unshift({
      id: data.id,
      createdAt: new Date(data.created_at).getTime(),
      title: data.title,
      promptText: data.prompt_text,
      labels: data.labels
    });

    showToast('הפרומפט נוסף לגלריה! 🎉');
    updatePublishButton();
  } catch (e) {
    console.error('Error publishing prompt:', e);
    showToast('שגיאה בשמירת הפרומפט');
  }
}

async function deletePromptFromGallery(id) {
  const client = initSupabase();
  if (!client) {
    showToast('שגיאה בחיבור לשרת');
    return;
  }

  try {
    const { error } = await client
      .from('prompts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    state.gallery = state.gallery.filter(p => p.id !== id);
    renderGalleryContent();
    showToast('הפרומפט נמחק מהגלריה');
  } catch (e) {
    console.error('Error deleting prompt:', e);
    showToast('שגיאה במחיקת הפרומפט');
  }
}

function usePromptFromGallery(id) {
  const prompt = state.gallery.find(p => p.id === id);
  if (!prompt) return;

  // Reset conversation and load prompt data
  resetConversation();

  // Populate answers from labels
  state.answers = { ...prompt.labels };
  state.currentPrompt = prompt.promptText;
  state.currentStep = INTERVIEW_STEPS.length;
  state.isComplete = true;

  // Update canvas fields
  updateCanvasField('task', prompt.labels.task);
  updateCanvasField('role', prompt.labels.audience);
  updateCanvasField('format', prompt.labels.format);
  updateCanvasField('tone', prompt.labels.tone);
  updateCanvasField('constraints', prompt.labels.constraints || prompt.labels.details);

  // Show prompt preview
  elements.promptPreview.textContent = prompt.promptText;
  elements.promptPreview.classList.remove('hidden');

  // Update progress indicator
  updateProgressIndicator();
  updateActionButtons();
  updatePublishButton();

  // Clear chat and show loaded message (no hint - these are action buttons)
  elements.chatContainer.innerHTML = '';
  addAssistantMessage(
    `טענתי את הפרומפט "${prompt.title}" מהגלריה.\n\nאפשר להריץ אותו עכשיו או להעתיק אותו ללוח.`,
    ['הרץ פרומפט', 'העתק לקליפבורד', 'התחל מחדש'],
    false
  );

  closeGalleryModal();
}

function getFilteredGalleryPrompts() {
  let prompts = [...state.gallery];

  // Apply search query
  if (state.gallerySearchQuery) {
    const query = state.gallerySearchQuery.toLowerCase();
    prompts = prompts.filter(p => {
      const searchText = [
        p.title,
        p.promptText,
        ...Object.values(p.labels)
      ].join(' ').toLowerCase();
      return searchText.includes(query);
    });
  }

  // Apply tab filter (by task category)
  if (state.galleryActiveTab !== 'all') {
    prompts = prompts.filter(p => p.labels.task === state.galleryActiveTab);
  }

  return prompts;
}

function getAllLabelsOfType(labelType) {
  const labels = new Set();
  state.gallery.forEach(p => {
    if (p.labels[labelType]) {
      labels.add(p.labels[labelType]);
    }
  });
  return Array.from(labels);
}

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
  chatContainer: document.getElementById('chat-container'),
  userInput: document.getElementById('user-input'),
  sendBtn: document.getElementById('send-btn'),
  canvasRole: document.getElementById('canvas-role'),
  canvasTask: document.getElementById('canvas-task'),
  canvasFormat: document.getElementById('canvas-format'),
  canvasTone: document.getElementById('canvas-tone'),
  canvasConstraints: document.getElementById('canvas-constraints'),
  promptPreview: document.getElementById('prompt-preview'),
  togglePreview: document.getElementById('toggle-preview'),
  runPrompt: document.getElementById('run-prompt'),
  copyPrompt: document.getElementById('copy-prompt'),
  publishPrompt: document.getElementById('publish-prompt'),
  resetChat: document.getElementById('reset-chat'),
  toast: document.getElementById('toast'),
  progressContainer: document.getElementById('progress-container'),
  // Gallery elements
  galleryBtn: document.getElementById('gallery-btn'),
  galleryModal: document.getElementById('gallery-modal'),
  galleryClose: document.getElementById('gallery-close'),
  gallerySearch: document.getElementById('gallery-search'),
  galleryTabs: document.getElementById('gallery-tabs'),
  galleryGrid: document.getElementById('gallery-grid'),
  galleryEmpty: document.getElementById('gallery-empty'),
  // Mobile drawer elements
  promptDrawer: document.getElementById('prompt-drawer'),
  drawerOverlay: document.getElementById('drawer-overlay'),
  drawerHandle: document.getElementById('drawer-handle')
};

// ============================================
// SYSTEM PROMPT - Only for generating smart suggestions
// ============================================
const SUGGESTION_PROMPT = `אתה עוזר לבנות פרומפטים. המשתמש בונה פרומפט ואתה צריך להציע הצעות רלוונטיות.

## המשימה שלך:
הצע 4 תשובות אפשריות לשאלה הנוכחית, בהתבסס על ההקשר של מה שהמשתמש כבר סיפר.

## פורמט התשובה - JSON בלבד:
{
  "suggestions": ["הצעה 1", "הצעה 2", "הצעה 3", "הצעה 4"]
}

## חשוב מאוד - התאמה להקשר:
- ההצעות חייבות להתאים באופן ישיר למה שהמשתמש רוצה ליצור
- חשוב על מה באמת נדרש כדי להשלים את המשימה שלו

### דוגמאות להתאמה:
- אם המשתמש רוצה לבנות **אפליקציה/תוכנה**:
  - קהל יעד: מפתחים, מעצבי UX, משקיעים, משתמשי קצה
  - פורמט: קוד עובד, מסמך דרישות, מוקאפ/עיצוב, תיאור טכני
  - טון: טכני ומדויק, ידידותי למשתמש, מקצועי לסטארטאפ

- אם המשתמש רוצה **מצגת/מסמך רשמי**:
  - קהל יעד: הנהלה, לקוחות, צוות
  - פורמט: שקפים, נקודות תמציתיות, דוח מפורט
  - טון: רשמי, משכנע, אינפורמטיבי

- אם המשתמש רוצה **תוכן שיווקי**:
  - קהל יעד: לקוחות פוטנציאליים, עוקבים ברשתות
  - פורמט: פוסט, מודעה, דף נחיתה, אימייל
  - טון: מעורר השראה, משכנע, קליט

## כללים:
- הצעות קצרות וברורות (2-4 מילים)
- בעברית בלבד
- אל תציע דברים גנריים - התאם למשימה הספציפית`;

// ============================================
// MOBILE DRAWER CONTROLS
// ============================================
function isMobile() {
  return window.innerWidth <= 768;
}

function openDrawer() {
  if (!elements.promptDrawer || !elements.drawerOverlay) return;
  state.drawerOpen = true;
  elements.promptDrawer.classList.add('open');
  elements.drawerOverlay.classList.remove('hidden');
  elements.drawerOverlay.classList.add('show');
}

function closeDrawer() {
  if (!elements.promptDrawer || !elements.drawerOverlay) return;
  state.drawerOpen = false;
  elements.promptDrawer.classList.remove('open');
  elements.drawerOverlay.classList.remove('show');
  setTimeout(() => {
    if (!state.drawerOpen) {
      elements.drawerOverlay.classList.add('hidden');
    }
  }, 300);
}

function toggleDrawer() {
  if (state.drawerOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

// Auto-open drawer when prompt is complete (mobile only)
function autoOpenDrawerOnComplete() {
  if (isMobile() && state.isComplete) {
    openDrawer();
  }
}

// ============================================
// GALLERY MODAL UI
// ============================================
function openGalleryModal() {
  if (!elements.galleryModal) return;
  elements.galleryModal.classList.remove('hidden');
  state.galleryActiveTab = 'all';
  state.gallerySearchQuery = '';
  if (elements.gallerySearch) elements.gallerySearch.value = '';
  renderGalleryTabs();
  renderGalleryContent();
}

function closeGalleryModal() {
  if (!elements.galleryModal) return;
  elements.galleryModal.classList.add('hidden');
}

function renderGalleryTabs() {
  if (!elements.galleryTabs) return;

  // Get unique task categories from gallery
  const categories = getAllLabelsOfType('task');

  // Build tabs: "הכל" + unique categories
  let html = `<button class="gallery-tab ${state.galleryActiveTab === 'all' ? 'active' : ''}" data-tab="all">הכל</button>`;

  categories.forEach(category => {
    const isActive = state.galleryActiveTab === category;
    html += `<button class="gallery-tab ${isActive ? 'active' : ''}" data-tab="${escapeHtml(category)}">${escapeHtml(category)}</button>`;
  });

  elements.galleryTabs.innerHTML = html;

  // Add click handlers
  elements.galleryTabs.querySelectorAll('.gallery-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.galleryActiveTab = tab.dataset.tab;
      renderGalleryTabs();
      renderGalleryContent();
    });
  });
}

function renderGalleryContent() {
  if (!elements.galleryGrid || !elements.galleryEmpty) return;

  const prompts = getFilteredGalleryPrompts();

  if (prompts.length === 0) {
    elements.galleryGrid.classList.add('hidden');
    elements.galleryEmpty.classList.remove('hidden');
    elements.galleryEmpty.textContent = state.gallery.length === 0
      ? 'הגלריה ריקה. פרסם פרומפטים כדי לראות אותם כאן!'
      : 'לא נמצאו פרומפטים התואמים לחיפוש';
    return;
  }

  elements.galleryEmpty.classList.add('hidden');
  elements.galleryGrid.classList.remove('hidden');

  elements.galleryGrid.innerHTML = prompts.map(prompt => {
    const date = new Date(prompt.createdAt).toLocaleDateString('he-IL');
    // Get first 100 chars of prompt as preview
    const preview = prompt.promptText.substring(0, 100).replace(/\n/g, ' ') + (prompt.promptText.length > 100 ? '...' : '');

    return `
      <div class="gallery-card" data-id="${prompt.id}">
        <div class="gallery-card-header">
          <span class="gallery-card-icon">🎯</span>
          <h3 class="gallery-card-title">${escapeHtml(prompt.title)}</h3>
        </div>
        <div class="gallery-card-preview">${escapeHtml(preview)}</div>
        <div class="gallery-card-date">${date}</div>
        <div class="gallery-card-actions">
          <button class="gallery-action-btn use-btn" data-id="${prompt.id}">השתמש</button>
          <button class="gallery-action-btn copy-btn" data-id="${prompt.id}">העתק</button>
          <button class="gallery-action-btn delete-btn" data-id="${prompt.id}">מחק</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event handlers
  elements.galleryGrid.querySelectorAll('.use-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      usePromptFromGallery(btn.dataset.id);
    });
  });

  elements.galleryGrid.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const prompt = state.gallery.find(p => p.id === btn.dataset.id);
      if (prompt) {
        await navigator.clipboard.writeText(prompt.promptText);
        showToast('הפרומפט הועתק! 📋');
      }
    });
  });

  elements.galleryGrid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('האם למחוק את הפרומפט מהגלריה?')) {
        deletePromptFromGallery(btn.dataset.id);
      }
    });
  });
}

function updatePublishButton() {
  if (!elements.publishPrompt) return;
  elements.publishPrompt.disabled = !state.isComplete || !state.currentPrompt;
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  try {
    console.log('Initializing app...');
    await loadGallery();
    console.log('Gallery loaded');
  } catch (e) {
    console.error('Error loading gallery:', e);
  }

  renderProgressIndicator();
  sendGreetingAndFirstQuestion();
  console.log('Init complete');

  // Event listeners
  elements.sendBtn.addEventListener('click', handleSend);
  elements.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  elements.togglePreview.addEventListener('click', () => {
    elements.promptPreview.classList.toggle('hidden');
  });

  elements.copyPrompt.addEventListener('click', copyPromptToClipboard);
  elements.runPrompt.addEventListener('click', runPrompt);
  elements.resetChat.addEventListener('click', resetConversation);

  // Gallery event listeners
  if (elements.publishPrompt) {
    elements.publishPrompt.addEventListener('click', publishPrompt);
  }

  if (elements.galleryBtn) {
    elements.galleryBtn.addEventListener('click', openGalleryModal);
  }

  if (elements.galleryClose) {
    elements.galleryClose.addEventListener('click', closeGalleryModal);
  }

  if (elements.galleryModal) {
    elements.galleryModal.addEventListener('click', (e) => {
      if (e.target === elements.galleryModal) {
        closeGalleryModal();
      }
    });
  }

  if (elements.gallerySearch) {
    elements.gallerySearch.addEventListener('input', (e) => {
      state.gallerySearchQuery = e.target.value;
      renderGalleryContent();
    });
  }

  // Mobile drawer event listeners
  if (elements.drawerHandle) {
    elements.drawerHandle.addEventListener('click', toggleDrawer);
  }

  if (elements.drawerOverlay) {
    elements.drawerOverlay.addEventListener('click', closeDrawer);
  }

  updateActionButtons();
  updatePublishButton();
}

// ============================================
// PROGRESS INDICATOR
// ============================================
function renderProgressIndicator() {
  if (!elements.progressContainer) return;

  const stepsHtml = INTERVIEW_STEPS.map((step, index) => {
    const status = index < state.currentStep ? 'done' :
                   index === state.currentStep ? 'current' : 'pending';
    return `<div class="progress-step ${status}" data-step="${index}" title="${step.question}">
      <span class="step-dot"></span>
      <span class="step-label">${step.icon}</span>
    </div>`;
  }).join('');

  elements.progressContainer.innerHTML = stepsHtml;
}

function updateProgressIndicator() {
  if (!elements.progressContainer) return;

  const steps = elements.progressContainer.querySelectorAll('.progress-step');
  steps.forEach((stepEl, index) => {
    stepEl.classList.remove('done', 'current', 'pending');
    if (index < state.currentStep) {
      stepEl.classList.add('done');
    } else if (index === state.currentStep) {
      stepEl.classList.add('current');
    } else {
      stepEl.classList.add('pending');
    }
  });
}

// ============================================
// GREETING & QUESTIONS
// ============================================
function sendGreetingAndFirstQuestion() {
  const firstStep = INTERVIEW_STEPS[0];
  addAssistantMessage(
    `שלום! 👋 אני כאן לעזור לך לבנות פרומפט מקצועי ואפקטיבי.\n\n${firstStep.question}`,
    firstStep.defaultSuggestions
  );
}

function askCurrentQuestion(suggestions = null) {
  const step = INTERVIEW_STEPS[state.currentStep];
  if (!step) return;

  const finalSuggestions = suggestions || step.defaultSuggestions;
  addAssistantMessage(step.question, finalSuggestions);
}

// ============================================
// MESSAGE HANDLING
// ============================================
async function handleSend() {
  const text = elements.userInput.value.trim();
  if (!text || state.isLoading) return;

  elements.userInput.value = '';

  // If in conversation mode (after running prompt), continue that conversation
  if (state.inConversationMode) {
    await continueConversation(text);
    return;
  }

  addUserMessage(text);

  // Store answer for current step
  const currentStepConfig = INTERVIEW_STEPS[state.currentStep];
  if (currentStepConfig) {
    state.answers[currentStepConfig.id] = text;
    updateCanvasField(currentStepConfig.field, text);
  }

  // Add to conversation history
  state.conversationHistory.push({
    role: 'user',
    content: text,
    step: state.currentStep,
    stepId: currentStepConfig?.id
  });

  // Move to next step
  state.currentStep++;
  updateProgressIndicator();

  // Check if interview is complete
  if (state.currentStep >= INTERVIEW_STEPS.length) {
    completeInterview();
  } else {
    // Get smart suggestions for next question
    await askNextQuestion();
  }
}

async function askNextQuestion() {
  const nextStep = INTERVIEW_STEPS[state.currentStep];
  if (!nextStep) return;

  state.isLoading = true;
  elements.sendBtn.disabled = true;
  addTypingIndicator();

  try {
    // Build context from previous answers
    const context = Object.entries(state.answers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const messages = [{
      role: 'user',
      content: `${SUGGESTION_PROMPT}

## מה המשתמש כבר סיפר:
${context}

## השאלה הנוכחית:
${nextStep.question}

## הצעות ברירת מחדל (לעזור לך להבין את הסגנון):
${nextStep.defaultSuggestions.join(', ')}

החזר JSON עם suggestions מותאמות להקשר.`
    }];

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });

    removeTypingIndicator();

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    // Parse suggestions from response
    let suggestions = nextStep.defaultSuggestions;
    try {
      const jsonMatch = data.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.suggestions && Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          suggestions = parsed.suggestions.slice(0, 4);
        }
      }
    } catch (e) {
      console.log('Using default suggestions');
    }

    askCurrentQuestion(suggestions);

  } catch (error) {
    console.error('Error getting suggestions:', error);
    removeTypingIndicator();
    // Fall back to default suggestions
    askCurrentQuestion(nextStep.defaultSuggestions);
  }

  state.isLoading = false;
  elements.sendBtn.disabled = false;
}

// ============================================
// PROMPT GENERATION SYSTEM PROMPT
// ============================================
const PROMPT_ENGINEER_SYSTEM = `אתה מהנדס פרומפטים בכיר באנתרופיק, מומחה עולמי ביצירת פרומפטים אפקטיביים ומקצועיים.

## התפקיד שלך:
לקחת את הדרישות שאסף המשתמש וליצור פרומפט מקצועי שה-AI יוכל להשתמש בו ישירות.

## מבנה הפרומפט שתיצור:

הפרומפט חייב להכיל את החלקים הבאים בסדר הזה:

### 1. הגדרת תפקיד (Role)
פתח במשפט שמגדיר מי ה-AI בהקשר הזה. לדוגמה:
- "אתה מנהל מוצר בכיר עם 10 שנות ניסיון..."
- "אתה מפתח Full Stack מומחה..."
- "אתה יועץ אסטרטגי לארגונים..."

### 2. תיאור המשימה
הסבר בבירור מה צריך ליצור, עבור מי, ומה המטרה.

### 3. שלב איסוף מידע (חשוב מאוד!)
הוסף פסקה שמנחה את ה-AI לשאול שאלות לפני שהוא מתחיל לעבוד:
"לפני שתתחיל, שאל אותי 3-5 שאלות ממוקדות כדי להבין טוב יותר את [הפרויקט/הצורך/ההקשר]. לדוגמה: [2-3 שאלות לדוגמה רלוונטיות למשימה]"

### 4. הנחיות לפורמט ולסגנון
פרט את הפורמט הרצוי, הטון, האורך, ומה לכלול/להימנע.

## פורמט התשובה:
החזר **רק** את הפרומפט עצמו, ללא JSON, ללא הסברים, ללא מרכאות מסביב.
הפרומפט צריך להיות מוכן להעתקה ושימוש מיידי.

## חשוב מאוד:
- התאם את התפקיד והשאלות למשימה הספציפית שהמשתמש ביקש
- אל תשתמש בדוגמאות קבועות - צור פרומפט מותאם אישית
- השאלות צריכות להיות רלוונטיות לתוצר המבוקש

## דוגמאות (להמחשה בלבד - אל תעתיק!):

**למצגת:**
"אתה יועץ מצגות בכיר... לפני שתתחיל, שאל: מה המסר המרכזי? כמה זמן יש להצגה? מה הרקע של הקהל?"

**למסמך טכני:**
"אתה ארכיטקט תוכנה... לפני שתתחיל, שאל: מהי המערכת? מי יקרא את המסמך? מה רמת הפירוט הנדרשת?"

**לתוכן שיווקי:**
"אתה קופירייטר מנוסה... לפני שתתחיל, שאל: מה המוצר/שירות? מה הערך הייחודי? מי קהל היעד?"

צור פרומפט חדש ומותאם לפי הדרישות שקיבלת - אל תעתיק מהדוגמאות!`;

// ============================================
// INTERVIEW COMPLETION
// ============================================
async function completeInterview() {
  state.isLoading = true;
  addAssistantMessage('מייצר פרומפט מקצועי... ✨');
  addTypingIndicator();

  try {
    const prompt = await generateProfessionalPrompt();
    state.currentPrompt = prompt;
    state.isComplete = true;

    elements.promptPreview.textContent = prompt;
    elements.promptPreview.classList.remove('hidden');

    removeTypingIndicator();

    // Show completion message (no hint - these are action buttons)
    addAssistantMessage(
      `מצוין! 🎉 יצרתי עבורך פרומפט מקצועי.\n\nאפשר להריץ אותו עכשיו או להעתיק אותו ללוח.`,
      ['הרץ פרומפט', 'העתק לקליפבורד', 'התחל מחדש'],
      false
    );

    // Auto-open drawer on mobile
    autoOpenDrawerOnComplete();

  } catch (error) {
    console.error('Error generating prompt:', error);
    removeTypingIndicator();

    // Fallback to basic prompt
    const basicPrompt = buildBasicPrompt();
    state.currentPrompt = basicPrompt;
    state.isComplete = true;

    elements.promptPreview.textContent = basicPrompt;
    elements.promptPreview.classList.remove('hidden');

    addAssistantMessage(
      `הפרומפט מוכן (גרסה בסיסית).\n\nאפשר להריץ אותו עכשיו או להעתיק אותו ללוח.`,
      ['הרץ פרומפט', 'העתק לקליפבורד', 'התחל מחדש'],
      false
    );

    // Auto-open drawer on mobile
    autoOpenDrawerOnComplete();
  }

  state.isLoading = false;
  updateActionButtons();
}

async function generateProfessionalPrompt() {
  const { task, audience, format, tone, details, constraints } = state.answers;

  const userRequest = `## הדרישות שאסף המשתמש:

**התוצר המבוקש:** ${task || 'לא צוין'} ← זה התוצר! התמקד בזה!
**קהל היעד:** ${audience || 'לא צוין'}
**פורמט רצוי:** ${format || 'לא צוין'}
**טון וסגנון:** ${tone || 'לא צוין'}
**פרטים לכלול:** ${details || 'אין דרישות מיוחדות'}
**הגבלות:** ${constraints || 'אין הגבלות'}

צור פרומפט מקצועי ליצירת **${task || 'התוצר'}** על בסיס דרישות אלו.

חשוב:
1. הפרומפט הוא ליצירת ${task || 'התוצר'} - לא משהו אחר!
2. הגדר תפקיד מתאים (מומחה ב${task || 'תחום'}, לא "מהנדס פרומפטים")
3. השאלות שה-AI ישאל צריכות להיות על התוכן של ה${task || 'תוצר'} - לא על אפליקציות או משהו אחר
4. החזר רק את הפרומפט עצמו, ללא הסברים`;

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: PROMPT_ENGINEER_SYSTEM + '\n\n' + userRequest }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json();

  // Return the raw content (no JSON parsing needed)
  return data.content.trim();
}

function buildBasicPrompt() {
  const { task, audience, format, tone, details, constraints } = state.answers;

  let prompt = '';

  if (audience) {
    prompt += `אתה כותב עבור ${audience}.\n\n`;
  }

  if (task) {
    prompt += `המשימה: צור ${task}`;
    if (audience) {
      prompt += ` עבור ${audience}`;
    }
    prompt += '.\n\n';
  }

  if (format && format !== 'אין דרישות מיוחדות') {
    prompt += `פורמט: ${format}\n`;
  }

  if (tone) {
    prompt += `טון: ${tone}\n`;
  }

  if (details && details !== 'אין דרישות מיוחדות') {
    prompt += `יש לכלול: ${details}\n`;
  }

  if (constraints && constraints !== 'אין הגבלות') {
    prompt += `הגבלות: ${constraints}\n`;
  }

  prompt += '\nאם חסר לך מידע חשוב להשלמת המשימה, אנא שאל שאלות הבהרה לפני שתתחיל.';

  return prompt.trim();
}

// ============================================
// CANVAS UPDATES
// ============================================
function updateCanvasField(field, value) {
  const fieldMap = {
    'task': elements.canvasTask,
    'role': elements.canvasRole,
    'format': elements.canvasFormat,
    'tone': elements.canvasTone,
    'constraints': elements.canvasConstraints,
    'details': elements.canvasConstraints // details goes into constraints area
  };

  const element = fieldMap[field];
  if (element) {
    element.textContent = value;
    element.classList.remove('empty');

    // Highlight animation
    const section = element.closest('.canvas-section');
    if (section) {
      section.classList.add('highlight');
      setTimeout(() => section.classList.remove('highlight'), 1000);
    }
  }
}

// ============================================
// UI HELPERS
// ============================================
function addUserMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user';
  messageDiv.innerHTML = `
    <div class="message-avatar">👤</div>
    <div class="message-content">${escapeHtml(text)}</div>
  `;
  elements.chatContainer.appendChild(messageDiv);
  scrollToBottom();
}

function addAssistantMessage(text, suggestions = null, showCustomHint = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';

  let suggestionsHtml = '';
  if (suggestions && suggestions.length > 0) {
    const hintHtml = showCustomHint ? '<div class="suggestions-hint">או הקלד/י תשובה משלך למטה ↓</div>' : '';
    suggestionsHtml = `
      <div class="suggestions">
        ${suggestions.map(s => `<button class="suggestion-chip" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
      </div>
      ${hintHtml}
    `;
  }

  messageDiv.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      ${escapeHtml(text).replace(/\n/g, '<br>')}
      ${suggestionsHtml}
    </div>
  `;

  elements.chatContainer.appendChild(messageDiv);

  // Add click handlers to suggestion chips
  if (suggestions) {
    messageDiv.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const value = chip.dataset.value;

        // Handle special completion suggestions
        if (value === 'הרץ פרומפט') {
          runPrompt();
          return;
        }
        if (value === 'העתק לקליפבורד') {
          copyPromptToClipboard();
          return;
        }
        if (value === 'התחל מחדש') {
          resetConversation();
          return;
        }

        elements.userInput.value = value;
        handleSend();
      });
    });
  }

  scrollToBottom();
}

function addTypingIndicator() {
  const indicatorDiv = document.createElement('div');
  indicatorDiv.className = 'message assistant message-loading';
  indicatorDiv.id = 'typing-indicator';
  indicatorDiv.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
  elements.chatContainer.appendChild(indicatorDiv);
  scrollToBottom();
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

function scrollToBottom() {
  elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2000);
}

// ============================================
// ACTION BUTTONS
// ============================================
function updateActionButtons() {
  const hasPrompt = state.currentPrompt.length > 20;
  elements.runPrompt.disabled = !hasPrompt || state.isLoading;
  elements.copyPrompt.disabled = !hasPrompt;
  updatePublishButton();
}

async function copyPromptToClipboard() {
  try {
    await navigator.clipboard.writeText(state.currentPrompt);
    showToast('הפרומפט הועתק! 📋');
  } catch (error) {
    showToast('שגיאה בהעתקה');
  }
}

async function runPrompt() {
  // Switch to conversation mode
  state.inConversationMode = true;
  state.promptConversation = []; // Track conversation for this prompt

  // Clear chat and show the prompt as a user message
  elements.chatContainer.innerHTML = '';
  addUserMessage(state.currentPrompt);

  // Add to conversation history
  state.promptConversation.push({
    role: 'user',
    content: state.currentPrompt
  });

  state.isLoading = true;
  updateActionButtons();
  addTypingIndicator();

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.promptConversation
      })
    });

    const data = await response.json();
    removeTypingIndicator();

    // Add AI response to conversation history
    state.promptConversation.push({
      role: 'assistant',
      content: data.content
    });

    // Show as regular assistant message (conversation style)
    addAssistantMessage(data.content.replace(/\n/g, '\n'), null, false);

  } catch (error) {
    console.error('Error:', error);
    removeTypingIndicator();
    addAssistantMessage('שגיאה בהרצת הפרומפט. נסה שוב?', null, false);
  }

  state.isLoading = false;
  updateActionButtons();
}

// Continue conversation after running prompt
async function continueConversation(userMessage) {
  if (!state.inConversationMode) return;

  addUserMessage(userMessage);
  state.promptConversation.push({
    role: 'user',
    content: userMessage
  });

  state.isLoading = true;
  addTypingIndicator();

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.promptConversation
      })
    });

    const data = await response.json();
    removeTypingIndicator();

    state.promptConversation.push({
      role: 'assistant',
      content: data.content
    });

    addAssistantMessage(data.content, null, false);

  } catch (error) {
    console.error('Error:', error);
    removeTypingIndicator();
    addAssistantMessage('שגיאה. נסה שוב?', null, false);
  }

  state.isLoading = false;
}

window.copyResult = async function(btn) {
  const resultContent = btn.closest('.message-content').querySelector('.result-content');
  try {
    await navigator.clipboard.writeText(resultContent.textContent);
    showToast('התוצאה הועתקה! 📋');
  } catch (error) {
    showToast('שגיאה בהעתקה');
  }
};

window.regenerate = function() {
  runPrompt();
};

// ============================================
// RESET
// ============================================
function resetConversation() {
  // Reset state
  state.currentStep = 0;
  state.answers = {};
  state.conversationHistory = [];
  state.currentPrompt = '';
  state.isComplete = false;
  state.inConversationMode = false;
  state.promptConversation = [];

  // Clear chat
  elements.chatContainer.innerHTML = '';

  // Reset canvas
  INTERVIEW_STEPS.forEach(step => {
    const fieldMap = {
      'task': elements.canvasTask,
      'role': elements.canvasRole,
      'format': elements.canvasFormat,
      'tone': elements.canvasTone,
      'constraints': elements.canvasConstraints
    };
    const el = fieldMap[step.field];
    if (el) {
      el.textContent = step.placeholder;
      el.classList.add('empty');
    }
  });

  elements.promptPreview.textContent = '';
  elements.promptPreview.classList.add('hidden');

  // Reset progress
  renderProgressIndicator();

  updateActionButtons();

  // Start fresh
  sendGreetingAndFirstQuestion();
}

// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', init);
