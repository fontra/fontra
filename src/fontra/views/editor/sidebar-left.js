import * as html from "/core/unlit.js";
import Sidebar from "./sidebar-base.js";

export default class SidebarLeft extends Sidebar {
  identifier = "left";
  attach(element) {
    element.prepend(this.getContentElement());
    element.querySelector(".main-overlay-container").prepend(this.getSidebarTabs());
    super.attach();
  }
  tabs = [
    {
      name: "text-entry",
      icon: "/images/texttool.svg",
    },
    {
      name: "glyph-search",
      icon: "/images/magnifyingglass.svg",
    },
    {
      name: "designspace-navigation",
      icon: "/images/sliders.svg",
    },
    {
      name: "user-settings",
      icon: "/images/gear.svg",
    },
    {
      name: "reference-font",
      icon: "/images/reference.svg",
    },
  ];
  getSidebarTabContents() {
    return [
      html.div(
        {
          "class": "sidebar-content",
          "data-sidebarName": "text-entry",
        },
        [
          html.div(
            {
              class: "sidebar-text-entry",
            },
            [
              html.createDomElement("textarea", {
                rows: 1,
                wrap: "off",
                id: "text-entry-textarea",
              }),
              html.div(
                {
                  id: "text-align-menu",
                },
                [
                  html.createDomElement("inline-svg", {
                    dataAlign: "left",
                    src: "/images/alignleft.svg",
                  }),
                  html.createDomElement("inline-svg", {
                    class: "selected",
                    dataAlign: "center",
                    src: "/images/aligncenter.svg",
                  }),
                  html.createDomElement("inline-svg", {
                    dataAlign: "right",
                    src: "/images/alignright.svg",
                  }),
                ]
              ),
            ]
          ),
        ]
      ),
      html.div(
        {
          "class": "sidebar-content",
          "data-sidebarName": "glyph-search",
        },
        [
          html.div(
            {
              class: "sidebar-glyph-search",
            },
            [
              html.createDomElement("glyphs-search", {
                id: "glyphs-search",
              }),
            ]
          ),
        ]
      ),
      html.div(
        {
          "class": "sidebar-content",
          "data-sidebarName": "designspace-navigation",
        },
        [
          html.div(
            {
              class: "designspace-navigation",
            },
            [
              html.createDomElement(
                "designspace-location",
                {
                  id: "designspace-location",
                },
                []
              ),
              html.createDomElement("ui-list", {
                id: "sources-list",
              }),
              html.createDomElement("add-remove-buttons", {
                id: "sources-list-add-remove-buttons",
              }),
            ]
          ),
        ]
      ),
      html.div(
        {
          "class": "sidebar-content",
          "data-sidebarName": "user-settings",
        },
        [
          html.div({ class: "sidebar-settings" }, [
            html.createDomElement("grouped-settings", {
              id: "user-settings",
            }),
          ]),
        ]
      ),
      html.div(
        {
          "class": "sidebar-content",
          "data-sidebarName": "reference-font",
        },
        [
          html.div(
            {
              class: "sidebar-reference-font",
            },
            [
              html.createDomElement("reference-font", {
                id: "reference-font",
              }),
            ]
          ),
        ]
      ),
      html.div(
        {
          "class": "sidebar-resize-gutter",
          "data-growDirection": "right",
        },
        []
      ),
    ];
  }
}
