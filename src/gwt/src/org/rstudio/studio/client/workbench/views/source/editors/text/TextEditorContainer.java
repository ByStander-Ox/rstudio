/*
 * TextEditorContainer.java
 *
 * Copyright (C) 2009-12 by RStudio, Inc.
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

package org.rstudio.studio.client.workbench.views.source.editors.text;

import java.util.ArrayList;

import org.rstudio.core.client.widget.CanFocus;
import org.rstudio.core.client.widget.IsHideableWidget;

import com.google.gwt.dom.client.Style.Unit;
import com.google.gwt.user.client.ui.LayoutPanel;

// container that holds a text editor, but which also supports juxtoposing
// additional widgets over the top of the editor

public class TextEditorContainer extends LayoutPanel implements CanFocus
{  
   public interface Editor extends IsHideableWidget
   {
      String getCode();
      void setCode(String code);
   }
   
   public TextEditorContainer(Editor editor)
   {
      editor_ = editor;
      addWidget(editor);
   }
   
   @Override
   public void focus()
   {
      widgets_.forEach(widget -> {
         if (widget.isVisible()) 
         {
            widget.focus();
         }
      });
   }
   
   
   public Editor getEditor()
   {
      return editor_;
   }
   
   public boolean isEditorActive()
   {
      return isWidgetActive(editor_);
   }
   
   public boolean isWidgetActive(IsHideableWidget widget)
   {
      int idx = widgets_.indexOf(widget);
      if (idx != -1)
         return widgets_.get(idx).isVisible();
      else
         return false;
   }
   
   public void activateEditor()
   {
      activateWidget(editor_);
   }
  
   // activate a widget
   public void activateWidget(IsHideableWidget widget)
   {
      // add the editor if don't already have it
      if (!widgets_.contains(widget))
         addWidget(widget);
      
      // set it visible (and others invisible)
      widgets_.forEach(w -> {
         setWidgetVisible(w.asWidget(), w == widget);
      });
   }
   
   // add a widget (not activated by default)
   private void addWidget(IsHideableWidget widget)
   {
      // add editor to container
      add(widget.asWidget());
      
      // have it take up the full container (but make it invisible by default)
      setWidgetVisible(widget.asWidget(), false);
      setWidgetLeftRight(widget.asWidget(), 0, Unit.PX, 0, Unit.PX);
      setWidgetTopBottom(widget.asWidget(), 0, Unit.PX, 0, Unit.PX);
      
      // add to list of editors we are managimg
      widgets_.add(widget);
   }
  
   private final Editor editor_;
   private ArrayList<IsHideableWidget> widgets_ = new ArrayList<IsHideableWidget>();
}