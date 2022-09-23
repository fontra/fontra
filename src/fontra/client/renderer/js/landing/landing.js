import { loaderSpinner } from "../core/loader-spinner.js";
import { getRemoteProxy } from "../core/remote.js";
import { autoReload, themeSwitchFromLocalStorage } from "../core/utils.js";


export async function startupLandingPage(authenticateFunc) {
  console.log("ydasda");
  if (autoReload()) {
    // Will reload
    return;
  }
  themeSwitchFromLocalStorage();

  if (authenticateFunc) {
    if (!authenticateFunc()) {
      return;
    }
  }
  const projectList = await loaderSpinner(fetchJSON("/projectlist"));
  const projectListContainer = document.querySelector("#project-list");
  projectListContainer.classList.remove("hidden");

  for (const project of projectList) {
    const projectElement = document.createElement("a")
    projectElement.href = "./editor.html?" + project;
    projectElement.className = "project-item";
    projectElement.append(project);
    projectListContainer.appendChild(projectElement);
  }
}


async function fetchJSON(url) {
  // TODO: discover localhost
  const response = await fetch(`http://localhost:8000${url}`);
  return await response.json();
}
