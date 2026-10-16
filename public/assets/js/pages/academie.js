import { h } from "../ui.js";

const paragraphs = (list) => list.map((text) => h("p", {}, text));

export function init(settings) {
  const mission = document.getElementById("academie-mission");
  if (mission && settings.academieMission?.length) mission.replaceChildren(...paragraphs(settings.academieMission));
  const team = document.getElementById("academie-team");
  if (team && settings.academieTeam?.length) {
    team.querySelector("[data-content]").replaceChildren(...paragraphs(settings.academieTeam));
    team.hidden = false;
  }
}
