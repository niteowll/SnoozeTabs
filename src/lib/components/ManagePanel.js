import React from 'react';

import moment from 'moment';
import classnames from 'classnames';

import Calendar from 'rc-calendar';
import TimePickerPanel from 'rc-time-picker/lib/Panel';

export default class ManagePanel extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      datepickerActive: false,
      editedItem: null,
      dateChoice: null
    };
  }

  render() {
    const { id, entries, active, switchPanel } = this.props;
    const { datepickerActive } = this.state;
    const timePickerElement = <TimePickerPanel />;

    const sortedEntries = [...entries];
    sortedEntries.sort((a, b) => a.time - b.time);

    return (
      <div>
        <div id={id} className={classnames('panel', { active })}>
          <div className="header">Manage Snoozed Tabs</div>
          <ul className="entries">
            { sortedEntries.map((item, idx) => this.renderEntry(idx, item)) }
          </ul>
          <div className="footer">
            <div className="back" onClick={ ev => switchPanel('main') }><span>« Back</span></div>
          </div>
        </div>
        <div id="manageCalendar" className={classnames('panel', { active: datepickerActive })}>
          <div className="header">Edit Date/Time</div>
          <Calendar showOk={false} showDateInput={false}
                    defaultvalue={this.state.dateChoice}
                    timePicker={timePickerElement}
                    onSelect={ value => this.handleTimeSelect(value) } />
          <div className="footer">
            <div className="back"
                 onClick={ ev => this.closeTimeSelect() }><span>« Back</span></div>
            <div className="confirm snooze"
                 onClick={ ev => this.confirmTimeSelect() }><span>Snooze!</span></div>
          </div>
        </div>
      </div>
    );
  }

  renderEntry(idx, item) {
    const { openSnoozedTab, cancelSnoozedTab, updateSnoozedTab } = this.props;
    const date = moment(item.time);
    return (
      <li className="entry" key={idx}>
        <div className="icon">
          <img src={item.icon || '../icons/nightly.svg'} />
        </div>
        <div className="content" onClick={ev => openSnoozedTab(item)}>
          <div className="title" title={item.title}>{item.title || '&nbsp;'}</div>
          <div className="url" title={item.url}>{item.url || '&nbsp;'}</div>
        </div>
        <div className="date" onClick={ev => this.handleEntryEdit(ev, item)}>
          <span>{date.format('ddd, MMM D') || 'Later'}</span>
          <span>{date.format('[@] ha') || ''}</span>
        </div>
        <div className="delete" onClick={ev => cancelSnoozedTab(item)}>
          <img src="../icons/Trash.svg" width="16" height="16" />
        </div>
      </li>
    );
  }

  handleEntryEdit(ev, item) {
    console.log('handleEntryEdit', item);
    this.setState({
      datepickerActive: true,
      editedItem: item,
      dateChoice: item.date
    });
  }

  handleTimeSelect(value) {
    this.setState({ dateChoice: value });
  }

  closeTimeSelect() {
    this.setState({ datepickerActive: false });
  }

  confirmTimeSelect() {
    const { dateChoice, editedItem } = this.state;
    const { updateSnoozedTab } = this.props;

    if (!dateChoice) { return; }

    updateSnoozedTab(
      editedItem,
      { ...editedItem, time: dateChoice.valueOf() }
    );
    this.setState({
      datepickerActive: false,
      editedItem: null,
      dateChoice: null
    });
  }

}
