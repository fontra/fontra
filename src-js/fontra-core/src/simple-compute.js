/**
 * Adapted from
 * The expression calculator
 * from https://github.com/malikzh/computejs
 *
 * @author Malik Zharykov <cmalikz.h@gmail.com>
 * @license MIT
 *
 * Original Lincense:
 *
 * MIT License
 *
 * Copyright (c) 2019 Malik Zharykov
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export class SimpleComputeError extends Error {}

export function compute(expression, functions, variables) {
  functions = functions || {};
  variables = variables || {};

  if (typeof expression !== "string") {
    throw new TypeError("compute `expression` argument not a string");
  }

  if (!expression) {
    throw new SimpleComputeError("Empty expression given");
  }

  // We perform lexical analysis
  let tokens = [];
  let i = 0;
  let tmp = "";
  let binaryOperators = ["SUM", "SUB", "MUL", "DIV", "MOD", "POW"];

  for (;;) {
    tmp = "";

    if (expression.charAt(i) == "") break;

    switch (expression.charAt(i)) {
      case "*":
        tokens.push({ token: "MUL" });
        ++i;
        break;
      case "/":
        tokens.push({ token: "DIV" });
        ++i;
        break;
      case "+":
        tokens.push({ token: "SUM" });
        ++i;
        break;
      case "-":
        tokens.push({ token: "SUB" });
        ++i;
        break;
      case "%":
        tokens.push({ token: "MOD" });
        ++i;
        break;
      case "^":
        tokens.push({ token: "POW" });
        ++i;
        break;
      case "(":
        tokens.push({ token: "LBR" });
        ++i;
        break;
      case ")":
        tokens.push({ token: "RBR" });
        ++i;
        break;
      case ",":
        tokens.push({ token: "COMMA" });
        ++i;
        break;

      case " ":
      case "\r":
      case "\n":
        ++i;
        continue;

      default:
        // Processing number + number with a dot
        while (
          /^\d$/.test(expression.charAt(i)) ||
          (tmp.length > 0 && expression.charAt(i) == "." && tmp.indexOf(".") == -1) ||
          (tmp.length > 0 && expression.charAt(i) == "," && tmp.indexOf(",") == -1)
        ) {
          tmp += expression.charAt(i);
          ++i;
        }

        // If tmp is not empty, then we got a number
        if (tmp.length > 0) {
          tokens.push({ token: "NUMBER", value: tmp });
          continue;
        }

        // Execution will only get here if the symbol is not an operator or a number, let's check if it is a variable

        for (const allowHyphen of [true, false]) {
          // The first time we allow hyphens in the variable name, but if the variable
          // does not exist, we fall back to not allowing hyphens. This way we can
          // both match glyph names containing hyphens, as well as do `a-b` where a and
          // b are distinct variables or constants.
          const nonFirstRegex = allowHyphen ? /^[\d\-]$/i : /^[\d]$/i;
          let tmptmp = tmp;
          let tmp_i = i;
          while (
            /^[a-z_\.!]$/i.test(expression.charAt(tmp_i)) ||
            (tmptmp.length > 0 && nonFirstRegex.test(expression.charAt(tmp_i)))
          ) {
            tmptmp += expression.charAt(tmp_i);
            ++tmp_i;
          }
          if (!allowHyphen || (tmptmp.length > 0 && variables[tmptmp] !== undefined)) {
            tmp = tmptmp;
            i = tmp_i;
            break;
          }
        }

        if (tmp.length > 0) {
          tokens.push({ token: "VARIABLE", value: tmp });
          continue;
        }

        // If it is neither this nor that, we give an error
        throw new SimpleComputeError('Invalid symbol: "' + expression.charAt(i) + '"');
    }
  }

  // Next, after tokenization, we perform syntactic analysis and immediately calculate
  // The analysis is implemented by a simple LL parser
  const Parser = {
    BinaryOperator: function (operators, ValueFunc, CalcFunc, right_assoc) {
      let result = ValueFunc();

      if (result === false) {
        return false;
      }

      if (!right_assoc) {
        // Left-associative computation
        while (i < tokens.length) {
          if (operators.indexOf(tokens[i].token) == -1) {
            return result;
          }

          let op = tokens[i++].token;

          let right = this.MulDivModValue();

          if (right === false || right === null) {
            return right;
          }

          result = Number(CalcFunc(op, result, right));
        }
      } else {
        // Right-associative computation
        if (operators.indexOf(tokens[i].token) == -1) {
          return result;
        }

        let op = tokens[i++].token;

        let right = this.BinaryOperator(ValueFunc(), CalcFunc(), right_assoc);

        if (right === false || right === null) {
          return right;
        }

        result = Number(CalcFunc(op, result, right));
      }

      return result;
    },

    ScalarValue: function () {
      let va = false;

      if (tokens[i].token === "NUMBER") {
        return Number(tokens[i++].value.replace(",", "."));
      } else if (tokens[i].token === "SUM") {
        ++i;
        return this.BracketValue();
      } else if (tokens[i].token === "SUB") {
        ++i;
        va = this.BracketValue();

        if (va === false || va === null) {
          return va;
        }

        return -va;
      } else if (tokens[i].token === "VARIABLE") {
        if (variables[tokens[i].value] === undefined) {
          throw new SimpleComputeError(`Undefined name: '${tokens[i].value}'`);
        }
        return Number(variables[tokens[i++].value]);
      } else {
        return false;
      }
    },

    FuncValue: function () {
      if (
        !(
          i + 1 < tokens.length &&
          tokens[i].token === "VARIABLE" &&
          tokens[i + 1].token === "LBR"
        )
      ) {
        return this.ScalarValue();
      }

      let funcname = tokens[i].value;

      i += 2; // skip funcname(

      let args = [];

      while (true) {
        if (tokens[i].token === "RBR") {
          ++i;
          break;
        }

        let arg = this.SumSubValue();

        if (arg === false || arg === null) {
          return arg;
        }

        args.push(arg);

        if (i >= tokens.length) {
          return false;
        }

        if (tokens[i].token === "COMMA") {
          ++i;
          continue;
        }
      }

      if (functions[funcname] === undefined) {
        throw new SimpleComputeError("Undefined function call: " + funcname + "()");
      }

      return Number(functions[funcname](args));
    },

    BracketValue: function () {
      if (i >= tokens.length) {
        return false;
      }

      if (tokens[i].token !== "LBR") {
        return this.FuncValue();
      }

      ++i;

      let result = this.SumSubValue();

      if (i >= tokens.length || tokens[i].token !== "RBR") {
        return false;
      }

      ++i;

      return result;
    },

    PowValue: function () {
      return this.BinaryOperator(
        ["POW"],
        () => this.BracketValue(),
        function (op, result, right) {
          return op === "POW" ? Math.pow(result, right) : 0;
        },
        false
      );
    },

    MulDivModValue: function () {
      return this.BinaryOperator(
        ["MUL", "DIV", "MOD"],
        () => this.PowValue(),
        function (op, result, right) {
          return op === "MUL"
            ? result * right
            : op === "DIV"
            ? result / right
            : op === "MOD"
            ? result % right
            : 0;
        },
        false
      );
    },

    SumSubValue: function () {
      return this.BinaryOperator(
        ["SUM", "SUB"],
        () => this.MulDivModValue(),
        function (op, result, right) {
          return op === "SUM" ? result + right : op === "SUB" ? result - right : 0;
        },
        false
      );
    },
  };

  i = 0;
  const result = Parser.SumSubValue();

  if (i !== tokens.length && result !== null) {
    throw new SimpleComputeError(
      "Unexpected token: " + (i >= tokens.length ? "END" : tokens[i].token)
    );
  }

  if (result === false || result === null) {
    throw new SimpleComputeError("syntax error");
  }

  return Number(result);
}

export function nameCapture(namesObject, getter = null) {
  if (!getter) {
    getter = (namesObject, prop) => namesObject[prop];
  }
  const names = new Set();
  const namespace = new Proxy(
    {},
    {
      get(subject, prop) {
        const name = getter(namesObject, prop);
        if (name !== undefined) {
          names.add(prop);
          return name;
        }
      },
    }
  );

  return { names, namespace };
}
