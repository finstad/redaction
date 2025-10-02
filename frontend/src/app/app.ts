import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebViewerComponent } from './webviewer/webviewer.js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, WebViewerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App{
  title = 'Redaction Application';
}