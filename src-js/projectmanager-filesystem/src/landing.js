import { Backend } from "@fontra/core/backend-api.js";
import { loaderSpinner } from "@fontra/core/loader-spinner.js";
import "@fontra/core/theme-settings.js";

export async function startupLandingPage(authenticateFunc) {
  if (authenticateFunc) {
    if (!authenticateFunc()) {
      return;
    }
  }
  const projectList = await loaderSpinner(Backend.getProjects());
  const projectListContainer = document.querySelector("#project-list");
  projectListContainer.classList.remove("hidden");

  for (const project of projectList) {
    const projectElement = document.createElement("a");
    projectElement.href = "/fontoverview.html?project=" + project;
    projectElement.className = "project-item";
    projectElement.append(project);
    projectListContainer.appendChild(projectElement);
  }
}

startupLandingPage();
