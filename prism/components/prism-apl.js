Prism.languages.apl = {
	'comment': /(?:⍝|#[! ]).*$/m,
	'string': {
		pattern: /'(?:[^'\r\n]|'')*'/,
		greedy: true
	},
	'number': /¯?(?:\d*\.?\d+(?:e[+¯]?\d+)?|¯|∞)(?:j¯?(?:\d*\.?\d+(?:e[\+¯]?\d+)?|¯|∞))?/i,
	'statement': /:[A-Z][a-z][A-Za-z]*\b/,
	'system-function': {
		pattern: /⎕[A-Z]+/i,
		alias: 'function'
	},
	'constant': /[⍬⌾#⎕⍞]/,
<<<<<<< HEAD
	'function': /[-+×÷⌈⌊∣|⍳⍸?*⍟○!⌹<≤=>≥≠≡≢∊⍷∪∩~∨∧⍱⍲⍴,⍪⌽⊖⍉↑↓⊂⊃⊆⊇⌷⍋⍒⊤⊥⍕⍎⊣⊢⍁⍂≈⍯↗¤→]/,
=======
	'function': /[-+×÷⌈⌊∣|⍳?*⍟○!⌹<≤=>≥≠≡≢∊⍷∪∩~∨∧⍱⍲⍴,⍪⌽⊖⍉↑↓⊂⊃⌷⍋⍒⊤⊥⍕⍎⊣⊢⍁⍂≈⍯↗¤→]/,
>>>>>>> 8eb0ab6f76484ca47fa7acbf77657fab17b03ca7
	'monadic-operator': {
		pattern: /[\\\/⌿⍀¨⍨⌶&∥]/,
		alias: 'operator'
	},
	'dyadic-operator': {
		pattern: /[.⍣⍠⍤∘⌸@⌺]/,
		alias: 'operator'
	},
	'assignment': {
		pattern: /←/,
		alias: 'keyword'
	},
	'punctuation': /[\[;\]()◇⋄]/,
	'dfn': {
		pattern: /[{}⍺⍵⍶⍹∇⍫:]/,
		alias: 'builtin'
	}
};