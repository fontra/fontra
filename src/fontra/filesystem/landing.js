import { loaderSpinner } from '/core/loader-spinner.js';
import { getRemoteProxy } from '/core/remote.js';
import { themeSwitchFromLocalStorage } from '/core/utils.js';

export async function startupLandingPage(authenticateFunc) {
  themeSwitchFromLocalStorage();

  if (authenticateFunc) {
    if (!authenticateFunc()) {
      return;
    }
  }
  const projectList = await loaderSpinner(fetchJSON('/projectlist'));
  const projectListContainer = document.querySelector('#project-list');
  projectListContainer.classList.remove('hidden');

  for (const project of projectList) {
    const projectElement = document.createElement('a');
    projectElement.href = '/editor/-/' + project;
    projectElement.className = 'project-item';
    projectElement.append(project);
    projectListContainer.appendChild(projectElement);
  }
}

async function fetchJSON(url) {
  const response = await fetch(url);
  return await response.json();
}
