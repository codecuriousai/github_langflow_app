// Critical: Hardcoded credentials, SQL injection, eval usage
const password = 'supersecret'; // Hardcoded password (critical)
const userInput = "1; DROP TABLE users";
const query = `SELECT * FROM users WHERE id = '${userInput}'`; // SQL Injection (critical)
eval("console.log('Eval is dangerous!')"); // Use of eval (critical)

// High: Unvalidated input, missing error handling
function getUserAge(age) {
	if (age < 0) {
		throw 'Invalid age'; // Throwing string instead of Error (high)
	}
	return age;
}

// Medium: Unused variable, duplicate code
let unusedVar = 42; // Unused variable (medium)
function duplicate() {
	console.log('duplicate');
	console.log('duplicate'); // Duplicate code (medium)
}

// Low: Console log, commented code, magic number
console.log('This is a debug log'); // Console log (low)
// let x = 5; // Commented code (low)
let y = 3.14159; // Magic number (low)
