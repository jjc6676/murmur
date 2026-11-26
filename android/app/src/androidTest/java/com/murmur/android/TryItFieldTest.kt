package com.murmur.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.murmur.android.ui.TryItField
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TryItFieldTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun committedTextStaysVisibleAndSurvivesStateRestoration() {
        val restoration = StateRestorationTester(compose)
        restoration.setContent { MaterialTheme { TryItField() } }

        val field = compose.onNode(hasSetTextAction())
        field.performClick()
        field.performTextInput("Testing Murmur")
        field.assertIsDisplayed().assertTextContains("Testing Murmur")
        field.performTextInput(", one two three.")
        field.assertTextContains("Testing Murmur, one two three.")

        restoration.emulateSavedInstanceStateRestore()
        field.assertIsDisplayed().assertTextContains("Testing Murmur, one two three.")
    }
}
