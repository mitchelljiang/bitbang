/**
 * The About page (?p=about). Edit ABOUT to change what it says; any HTML works, and `.guide` styles apply.
 * Links to other pages in the site use `href="?p=id" data-nav`.
 */
const ABOUT = `
<section>
  <p>Hi, my name is Mitchell, and I am a 4th year Computer Engineering student at the Georgia Institute of Technology.
    I love designing embedded software and hardware, specifically consumer electronics. I have previous work experience
    interning at Apple and the Naval Postgraduate School, and I am currently a teaching assistant for ECE 4180: Embedded
    System Design.</p>
</section>

<section>
  <h2>Why bitbang exists</h2>
  <p>With AI becoming more widespread, it can be easy to gloss over the low-level fundamentals. This is meant to be a
    tool to help students learn how things work, not just what they are. I plan to add visualizations for bit
    manipulation and computer architecture, but communication protocols are something I am especially interested in,
    so I am focusing on those first ;)</p>
</section>

<section>
  <h2>Contact me</h2>
  <p>If you have any questions or feedback, feel free to send an email to <a class="about-email">the feedback address</a>!</p>
</section>`;

export function mountAbout(root: HTMLElement) {
  root.innerHTML = `
    <article class="guide about">
      <header class="intro">
        <p class="crumbs">About</p>
        <h1>About me</h1>
      </header>
      ${ABOUT}
    </article>`;
  // Put together here, like the footer's feedback link, so simple scrapers can't harvest the address.
  const address = ['feedback', 'bitbang.fyi'].join('@');
  for (const a of root.querySelectorAll<HTMLAnchorElement>('.about-email')) {
    a.href = `mailto:${address}`;
    a.textContent = address;
  }
}
