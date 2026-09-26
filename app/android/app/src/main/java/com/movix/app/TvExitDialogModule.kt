package com.movix.app

import android.app.Dialog
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** A native TV dialog: its red selector follows Android View focus itself. */
class TvExitDialogModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var dialog: Dialog? = null

    override fun getName() = "TvExitDialog"

    @ReactMethod
    fun show() {
        val activity = currentActivity ?: return
        val mode = activity.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK
        if (mode != Configuration.UI_MODE_TYPE_TELEVISION) return

        activity.runOnUiThread {
            if (activity.isFinishing || dialog?.isShowing == true) return@runOnUiThread

            val density = activity.resources.displayMetrics.density
            fun dp(value: Int) = (value * density + 0.5f).toInt()
            fun rounded(fill: Int, stroke: Int): GradientDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(12).toFloat()
                setColor(fill)
                setStroke(dp(2), stroke)
            }
            fun focusBackground(): StateListDrawable = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), rounded(0xFF7F1D1D.toInt(), 0xFFEF4444.toInt()))
                addState(intArrayOf(), rounded(0xFF1F2937.toInt(), 0xFF4B5563.toInt()))
            }
            fun label(text: String, size: Float, color: Int): TextView = TextView(activity).apply {
                this.text = text
                textSize = size
                setTextColor(color)
                gravity = Gravity.CENTER
            }

            val card = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(28), dp(26), dp(28), dp(26))
                background = rounded(0xFF111111.toInt(), 0xFFB04040.toInt())
            }
            card.addView(label("Quitter Movix ?", 24f, Color.WHITE))
            card.addView(label("Êtes-vous sûr de vouloir quitter l'application ?", 17f, 0xFFD1D5DB.toInt()).apply {
                setPadding(0, dp(10), 0, 0)
            })

            val actions = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                setPadding(0, dp(24), 0, 0)
            }
            fun action(text: String): TextView = label(text, 17f, Color.WHITE).apply {
                id = View.generateViewId()
                isFocusable = true
                isFocusableInTouchMode = true
                isClickable = true
                background = focusBackground()
                contentDescription = if (text == "NON") "Ne pas quitter" else "Quitter l'application"
            }
            val no = action("NON")
            val yes = action("OUI")
            actions.addView(no, LinearLayout.LayoutParams(dp(120), dp(52)).apply { marginEnd = dp(8) })
            actions.addView(yes, LinearLayout.LayoutParams(dp(120), dp(52)).apply { marginStart = dp(8) })
            card.addView(actions)

            val next = Dialog(activity).apply {
                setContentView(card)
                window?.setBackgroundDrawableResource(android.R.color.transparent)
                window?.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                window?.let { it.attributes = it.attributes.apply { dimAmount = 0.72f } }
                setOnDismissListener { if (dialog === this) dialog = null }
            }
            no.nextFocusRightId = yes.id
            yes.nextFocusLeftId = no.id
            no.setOnClickListener { next.dismiss() }
            yes.setOnClickListener { next.dismiss(); activity.finish() }
            dialog = next
            next.show()
            next.window?.setLayout(dp(460), WindowManager.LayoutParams.WRAP_CONTENT)
            no.requestFocus()
        }
    }

    override fun invalidate() {
        val current = dialog
        currentActivity?.runOnUiThread { current?.dismiss() }
        dialog = null
        super.invalidate()
    }
}
