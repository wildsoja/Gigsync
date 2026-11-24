/* Past events (from the original Wild Nation site). Newest first. */
window.WN_RECAPS = [
  { slug: "entanglement-2022", title: "Entanglement 2022", city: "Toronto", date: "August 2022", img: "/img/recaps/entanglement-2022.webp",
    text: "In August we took over Toop Lounge, Toronto's hottest lounge, and y'all already know the drill. Dress to impress, with a MASKED THEMED PARTY: no face, no case. Booths were fully reserved so nobody had to stand. A memorable night for everyone who pulled up." },
  { slug: "euphoria-2022", title: "Euphoria 2022", city: "Toronto", date: "March 2022", img: "/img/recaps/euphoria-2022.webp",
    text: "We delivered the Euphoria-themed party we promised. Big love to everyone involved, especially our special guest Obi from Netflix's Too Hot To Handle, and shoutout to the promo team. Missed it? We've got future events covered. Stay tuned for the next party and more guests ✨" },
  { slug: "childs-play-2021", title: "Child's Play 2021", city: "Hamilton", date: "October 2021", img: "/img/recaps/childs-play-2021.webp",
    text: "Friday, October 29th: Wild Nation shut down Hamilton. Child's Play was no play at all. People came from all over Ontario to kick off Halloween weekend with us, with our host all the way from Ottawa and a guest artist from Toronto. It was a movie." },
  { slug: "level-up-2021", title: "Level Up 2021", city: "Toronto", date: "October 2021", img: "/img/recaps/level-up-2021.webp",
    text: "A celebration of the big wins of the talented artists and performers in the GTA. A lil something during reading week to take your mind off school and just chill. Our guest artists were amazing. If you were tryna update your playlist, you had to be there." },
  { slug: "naija-independence-2021", title: "Nigeria Independence Day Party", city: "St. Catharines, Niagara", date: "October 2021", img: "/img/recaps/naija-independence-2021.webp",
    text: "Still gotta rep Nigeria in Canada. We got St. Catharines lit this time, partying hard to celebrate our country's independence. What a good day to be a Nigerian in the diaspora 🇳🇬 And if your DJ isn't the centre of attention at the party, you're doing something wrong." },
  { slug: "entanglement-2021", title: "Entanglement 2021", city: "Toronto", date: "August 2021", img: "/img/recaps/entanglement-2021.webp",
    text: "Entanglement: The Seductive Encounter was a highly anticipated party. What better way to wrap up the summer than with a few entanglements? And please, can somebody tell the legwork dancers to chill. Some of us are still learning, but they were the highlight of the night." },
  { slug: "august-exclusive-2021", title: "August Exclusive 2021", city: "Toronto", date: "August 2021", img: "/img/recaps/august-exclusive-2021.webp",
    text: "Calling all Leos. An exclusive celebration for Leos and anyone who loves a Leo. August Exclusive was the first of its kind and it's coming back every August." },
  { slug: "highway-2021", title: "Highway (Bus Party)", city: "Hamilton → Toronto", date: "June 2021", img: "/img/recaps/highway-bus-party-2021.webp",
    text: "A party on a bus? Now that's something you don't see every day. Our first time trying it and an absolute success. We took off from Hamilton to Toronto and back. Should we run it again?" },
  { slug: "entanglement-2020", title: "Entanglement 2020", city: "Where it started", date: "2020", img: "/img/recaps/entanglement-2020.webp",
    text: "Where it all started. Wild Nation's very first event, before we were even called Wild Nation, but somehow the pieces fell into place. It was such a hit during the pandemic that it sparked everything after and gave Wild Soja the platform to build on." },
];
window.WN_renderRecaps = function (el, list = window.WN_RECAPS) {
  el.innerHTML = list.map((r, i) => `<button class="recap reveal" data-i="${i}" aria-label="Read recap: ${r.title}">
    <img src="${r.img}" alt="${r.title} flyer" loading="lazy"><span class="cap"><small>${r.city} · ${r.date}</small><b>${r.title}</b></span></button>`).join("");
  let dlg = document.getElementById("recap-modal");
  if (!dlg) {
    dlg = document.createElement("dialog"); dlg.id = "recap-modal"; dlg.className = "modal";
    dlg.innerHTML = `<button class="icon-btn modal-close" aria-label="Close">✕</button><div class="modal-body"><img alt=""><div class="txt"><span class="eyebrow"></span><h3></h3><p></p></div></div>`;
    document.body.append(dlg);
    dlg.querySelector(".modal-close").onclick = () => dlg.close();
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".recap"); if (!b) return;
    const r = list[b.dataset.i];
    dlg.querySelector("img").src = r.img; dlg.querySelector("img").alt = r.title + " flyer";
    dlg.querySelector(".eyebrow").textContent = `${r.city} · ${r.date}`;
    dlg.querySelector("h3").textContent = r.title; dlg.querySelector("p").textContent = r.text;
    dlg.showModal();
  });
  window.WN.reveal(el);
};
