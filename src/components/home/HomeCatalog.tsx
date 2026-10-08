// src/components/home/HomeCatalog.tsx
// Customize's catalog (Home cards spec, Customize): every card under its
// group, marked "on Home" or with "+ Add".
import { HOME_CARDS, HOME_GROUPS } from '../../lib/home/cards'

interface HomeCatalogProps {
  /** The ids of the cards on Home now. */
  shown: ReadonlySet<string>
  onAdd: (id: string) => void
}

export function HomeCatalog({ shown, onAdd }: HomeCatalogProps) {
  return (
    <aside className="home-catalog" aria-label="Cards">
      {HOME_GROUPS.map((group) => {
        const cards = HOME_CARDS.filter((card) => card.group === group)
        if (cards.length === 0) return null
        return (
          <section key={group} className="home-catalog__group">
            <h3 className="home-catalog__heading">{group}</h3>
            {cards.map((card) => (
              <div key={card.id} className="home-catalog__card">
                <span className="home-catalog__name">{card.title}</span>
                {shown.has(card.id) ? (
                  <span className="home-catalog__on">on Home</span>
                ) : (
                  <button
                    type="button"
                    className="link-btn home-catalog__add"
                    onClick={() => onAdd(card.id)}
                  >
                    + Add
                  </button>
                )}
              </div>
            ))}
          </section>
        )
      })}
    </aside>
  )
}
