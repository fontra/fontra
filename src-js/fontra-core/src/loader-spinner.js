export async function loaderSpinner(promise) {
  incrementSpinnerStatus();
  let returnValue;
  try {
    returnValue = await promise;
  } finally {
    decrementSpinnerStatus();
  }
  return returnValue;
}

let spinnerStatus = 0;
let spinnerStartTimerID;

function incrementSpinnerStatus() {
  if (spinnerStatus == 0) {
    const spinner = document.querySelector("#global-loader-spinner");
    cancelTimer();
    spinnerStartTimerID = setTimeout(() => (spinner.style.display = "inherit"), 300);
  }
  spinnerStatus += 1;
}

function decrementSpinnerStatus() {
  spinnerStatus -= 1;
  if (spinnerStatus < 0) {
    throw new Error("assert -- spinnerStatus less than zero");
  } else if (spinnerStatus == 0) {
    cancelTimer();
    const spinner = document.querySelector("#global-loader-spinner");
    spinner.style.display = "none";
  }
}

function cancelTimer() {
  if (spinnerStartTimerID) {
    clearTimeout(spinnerStartTimerID);
    spinnerStartTimerID = undefined;
  }
}
