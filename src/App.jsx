import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Activity, Flame, Utensils, Zap, ChevronRight, Loader2, AlertCircle, Camera, Search, Scale, RefreshCw, User, LogOut, PlusCircle } from 'lucide-react';

// Configuração da API
// A chave será injetada automaticamente pelo ambiente de execução.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 

const App = () => {
  // --- GESTÃO DE UTILIZADORES ---
  const [currentUser, setCurrentUser] = useState(() => {
    return localStorage.getItem('nutriai_current_user') || null;
  });
  const [tempName, setTempName] = useState('');

  // --- ESTADO DA APP ---
  const [input, setInput] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState({ calories: 0, protein: 0 });
  
  const fileInputRef = useRef(null);

  // 1. CARREGAR DADOS QUANDO O UTILIZADOR MUDA
  useEffect(() => {
    if (!currentUser) return;

    try {
      // Carrega dados específicos deste utilizador (chave dinâmica)
      const storageKey = `nutriai_data_${currentUser}`;
      const savedItems = localStorage.getItem(storageKey);
      
      if (savedItems) {
        setItems(JSON.parse(savedItems));
      } else {
        setItems([]); // Novo utilizador começa a zero
      }
    } catch (e) {
      console.error("Erro ao carregar dados", e);
      setItems([]);
    }
  }, [currentUser]);

  // 2. GUARDAR DADOS QUANDO A LISTA MUDA
  useEffect(() => {
    if (!currentUser) return;

    const storageKey = `nutriai_data_${currentUser}`;
    localStorage.setItem(storageKey, JSON.stringify(items));
    
    // Recalcula totais
    const newTotals = items.reduce(
      (acc, item) => ({
        calories: acc.calories + (item.calories || 0),
        protein: acc.protein + (item.protein || 0),
      }),
      { calories: 0, protein: 0 }
    );
    setTotals(newTotals);
  }, [items, currentUser]);

  // FUNÇÕES DE LOGIN/LOGOUT
  const handleLogin = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    const name = tempName.trim();
    localStorage.setItem('nutriai_current_user', name);
    setCurrentUser(name);
    setTempName('');
  };

  const handleLogout = () => {
    localStorage.removeItem('nutriai_current_user');
    setCurrentUser(null);
    setItems([]);
  };

  // --- FUNÇÕES DA IA (Mesma lógica anterior) ---
  const callGeminiAPI = async (text, imageBase64 = null, mimeType = null) => {
    const systemPrompt = `
      Você é um nutricionista de alta precisão.
      Objetivo: Analisar refeição e retornar JSON.
      Contexto: O utilizador é ${currentUser}.
      Regras:
      1. Se não especificar peso, assuma porções médias (ex: bife ~120g) e INDIQUE em "serving_size".
      2. Estime calorias e proteínas com precisão.
      3. Responda APENAS JSON: { "foods": [ { "name": "...", "serving_size": "...", "calories": 0, "protein": 0.0, "emoji": "..." } ] }
    `;

    const userParts = [];
    if (text) {
      userParts.push({ text: `Analise para ${currentUser}: "${text}"` });
    } else {
       userParts.push({ text: `Analise imagem para ${currentUser}. Estime peso e macros.` });
    }

    if (imageBase64) {
      userParts.push({ inlineData: { mimeType, data: imageBase64 } });
    }

    const tools = [{ google_search: {} }];

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: userParts }],
            tools: tools,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
          }),
        }
      );

      if (!response.ok) throw new Error('Falha na IA');
      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resultText) throw new Error('Sem dados');
      return JSON.parse(resultText);
    } catch (err) {
      throw err;
    }
  };

  const processResponse = (data) => {
    if (data.error) {
      setError(data.error);
    } else if (data.foods && data.foods.length > 0) {
      const newItems = data.foods.map(food => ({
        ...food,
        id: Date.now() + Math.random()
      }));
      setItems(prev => [...newItems, ...prev]);
      setInput('');
    } else {
      setError("Não identifiquei alimentos.");
    }
  };

  const handleAnalyzeText = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await callGeminiAPI(input);
      processResponse(data);
    } catch (err) {
      setError("Erro ao consultar a IA.");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];
        try {
          const data = await callGeminiAPI(null, base64, file.type);
          processResponse(data);
        } catch (err) {
          setError("Erro na imagem.");
        } finally {
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro no arquivo.");
      setLoading(false);
    }
  };

  const removeItem = (id) => setItems(prev => prev.filter(item => item.id !== id));
  
  const clearAll = () => {
    if (window.confirm("Limpar tudo e começar novo dia?")) setItems([]);
  };

  const triggerCamera = () => fileInputRef.current.click();

  // --- RENDERIZAÇÃO: TELA DE LOGIN ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full border border-slate-100 text-center">
          <div className="bg-indigo-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
            <Activity size={40} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Bem-vindo ao NutriAI</h1>
          <p className="text-slate-500 mb-8 text-sm">O seu diário alimentar inteligente.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="text-left">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Como te chamas?</label>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="Ex: Ana"
                className="w-full mt-1 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!tempName.trim()}
              className="w-full bg-indigo-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Entrar <ChevronRight size={20} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- RENDERIZAÇÃO: APP PRINCIPAL ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-slate-100">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white shadow-indigo-200 shadow-md">
              <Activity size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">NutriAI</h1>
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Olá, {currentUser}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button 
                onClick={clearAll}
                className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-slate-50 transition-colors"
                title="Novo Dia"
              >
                <RefreshCw size={18} />
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
              title="Sair / Trocar Conta"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 pb-32 space-y-6">

        {/* Totals Summary */}
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl shadow-slate-200 transition-all hover:scale-[1.01] duration-300">
          <div className="flex justify-between items-end mb-4">
            <span className="text-slate-400 text-sm font-medium">Hoje</span>
            <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-full">
               <User size={10} /> {currentUser}
            </div>
          </div>
          <div className="flex gap-8">
            <div>
              <div className="text-4xl font-bold tracking-tighter">
                {Math.round(totals.calories)}
              </div>
              <div className="text-indigo-300 text-xs font-medium uppercase tracking-wider mt-1 flex items-center gap-1">
                <Flame size={12} /> Kcal
              </div>
            </div>
            <div className="w-px bg-slate-700 h-12 self-center"></div>
            <div>
              <div className="text-4xl font-bold tracking-tighter">
                {totals.protein.toFixed(1)}
              </div>
              <div className="text-blue-300 text-xs font-medium uppercase tracking-wider mt-1 flex items-center gap-1">
                <Zap size={12} /> Prot (g)
              </div>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="relative group">
          <div className="absolute inset-0 bg-indigo-100 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-300"></div>
          <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: 200g de arroz branco, feijão (1 concha)..."
              className="w-full p-4 pb-16 text-slate-700 placeholder-slate-400 focus:outline-none resize-none bg-transparent text-lg leading-relaxed"
              rows={3}
              disabled={loading}
            />
            
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-white via-white to-transparent flex justify-between items-center">
               <button
                onClick={triggerCamera}
                disabled={loading}
                className="p-2.5 rounded-xl text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                />
                <Camera size={20} />
                <span className="text-xs font-semibold">Foto</span>
              </button>

              <button
                onClick={handleAnalyzeText}
                disabled={loading || !input.trim()}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  loading || !input.trim()
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 active:scale-95'
                }`}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 text-sm animate-fade-in border border-red-100">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Food List */}
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-12 opacity-40 flex flex-col items-center">
              <div className="bg-white p-4 rounded-full mb-3 shadow-sm border border-slate-100">
                <Utensils size={32} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">Lista vazia</p>
            </div>
          ) : (
            items.map((item) => (
              <div 
                key={item.id} 
                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between animate-slide-up"
              >
                <div className="flex gap-4 min-w-0 flex-1">
                  <div className="text-3xl bg-slate-50 w-12 h-12 flex items-center justify-center rounded-xl shrink-0">
                    {item.emoji || '🥘'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-800 text-base capitalize truncate pr-2">
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1 mb-2 bg-slate-50 w-fit px-2 py-0.5 rounded-md">
                      <Scale size={10} className="shrink-0" />
                      <span className="truncate">{item.serving_size || 'Padrão'}</span>
                    </div>
                    <div className="flex gap-3 text-sm font-medium">
                      <span className="text-orange-600 flex items-center gap-1"><Flame size={10}/> {item.calories}</span>
                      <span className="text-blue-600 flex items-center gap-1"><Zap size={10}/> {item.protein}g</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </main>

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
export default App;